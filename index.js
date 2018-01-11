const micro = require('micro')
const { resolve, URL } = require('url')
const fetch = require('node-fetch')
const lintRules = require('./lib/lint-rules')

module.exports = (rules) => {
  const lintedRules = lintRules(rules).map(({pathname, pathnameRe, method, dest}) => {
    const methods = method ? method.reduce((final, c) => {
      final[c.toLowerCase()] = true
      return final
    }, {}) : null

    return {
      pathname,
      pathnameRegexp: new RegExp(pathnameRe || pathname || '.*'),
      dest,
      methods
    }
  })

  return micro(async (req, res) => {
    for (const { pathnameRegexp, methods, dest } of lintedRules) {
      if (pathnameRegexp.test(req.url) && (!methods || methods[req.method.toLowerCase()])) {
        await proxyRequest(req, res, dest)
        return
      }
    }

    res.writeHead(404)
    res.end('404 - Not Found')
  })
}

async function proxyRequest (req, res, dest) {
  const newUrl = resolve(dest, req.url)
  const url = new URL(dest)
  const proxyRes = await fetch(newUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: url.host
    },
    body: req
  })

  // Forward status code
  res.statusCode = proxyRes.status

  // Forward headers
  const headers = proxyRes.headers.raw()
  for (const key of Object.keys(headers)) {
    res.setHeader(key, headers[key])
  }

  // Stream the proxy response
  proxyRes.body.pipe(res)
  proxyRes.body.on('error', (err) => {
    console.error(`Error on proxying url: ${newUrl}`)
    console.error(err.stack)
    res.end()
  })

  req.on('abort', () => {
    proxyRes.body.destroy()
  })
}
