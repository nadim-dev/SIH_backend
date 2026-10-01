export const sessionCookieOptions = {
  httpOnly: true,
  signed: true,
  secure: true,
  sameSite: "none",
  path: "/",
};

export const clearSessionCookie = (res) => {
  const { signed, ...options } = sessionCookieOptions;
  res.clearCookie("sid", options);
};
