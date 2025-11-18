function cookieParser(req, _res, next) {
  const header = req.headers?.cookie;
  req.cookies = {};
  if (!header) {
    next();
    return;
  }

  header.split(';').forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return;
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue.join('=') || '');
    req.cookies[key] = value;
  });
  next();
}

module.exports = cookieParser;
