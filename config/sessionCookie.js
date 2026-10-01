export const sessionCookieOptions = {
  httpOnly: true,
  signed: true,
  // API requests go through the frontend site's /api proxy, so the cookie is
  // first-party and does not need SameSite=None third-party-cookie access.
  secure: true,
  sameSite: "lax",
  path: "/",
};

export const clearSessionCookie = (res) => {
  const { signed, ...options } = sessionCookieOptions;
  res.clearCookie("sid", options);
};
