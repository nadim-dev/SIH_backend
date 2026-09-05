import redisClient from "../config/redis.js";


export default async function checkAuth(req,res,next){

  const sessionId=req.signedCookies.sid;

  if(!sessionId){
      res.clearCookie("sid"); // if user manipulate session id then we will clear his cookie
      return res.status(401).json({"message":"not logged in"})
  }

  let session;
  try {
    session = await redisClient.hGetAll(`session:${sessionId}`);
  } catch (err) {
    res.clearCookie("sid");
    return res.status(401).json({"error":"not logged in"});
  }
  
  if (!session || Object.keys(session).length === 0) {
      res.clearCookie("sid");
      return res.status(401).json({"message":"not logged in"})
  }

  req.user={_id:session.userId,role:session.role};
  next();
}

 
export const allowRoles = (...roles) => {
    return async (req, res, next) => {
        const role=req.user.role;

        if (!roles.includes(role)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        next();
    };
};