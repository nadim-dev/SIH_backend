import redisClient from "../config/redis.js";
import { clearSessionCookie } from "../config/sessionCookie.js";


export default async function checkAuth(req,res,next){

  const sessionId=req.signedCookies.sid;
  console.log("sessionId",sessionId);
  if(!sessionId){
      clearSessionCookie(res); // if user manipulates session id, clear their cookie
      return res.status(401).json({"message":"not logged in"})
  }

  let session;
  try {
    session = await redisClient.hGetAll(`session:${sessionId}`);
  } catch (err) {
    clearSessionCookie(res);
    return res.status(401).json({"error":"not logged in"});
  }
  
  if (!session || Object.keys(session).length === 0) {
      clearSessionCookie(res);
      return res.status(401).json({"message":"not logged in"})
  }

  req.user={_id:session.userId,role:session.role};
  next();
}

 
export const allowRoles = (...roles) => {
    return async (req, res, next) => {
        const normalizeRole = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
        const role = normalizeRole(req.user.role);
        const allowedRoles = roles.map(normalizeRole);

        if (!allowedRoles.includes(role))
            return res.status(403).json({ message: 'Forbidden' });
        

        next();
    };
};
