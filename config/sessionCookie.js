// Separate frontend and API deployments need cross-site cookies in production.
const isProduction = process.env.NODE_ENV === "production";

export const sessionCookieOptions = {
  httpOnly: true,
  signed: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

export const clearSessionCookie = (res) => {
  const { signed, ...options } = sessionCookieOptions;
  res.clearCookie("sid", options);
};
