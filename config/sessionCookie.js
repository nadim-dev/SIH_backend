// Local development can use Lax cookies. Set COOKIE_SAME_SITE=none in
// production when the frontend and API are hosted on different sites.
const sameSite = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
const isCrossSite = sameSite === "none";

export const sessionCookieOptions = {
  httpOnly: true,
  signed: true,
  secure: isCrossSite,
  sameSite,
  path: "/",
};

export const clearSessionCookie = (res) => {
  const { signed, ...options } = sessionCookieOptions;
  res.clearCookie("sid", options);
};
