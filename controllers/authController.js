import  User from "../models/userModel.js";
import { loginSchema } from "../validators/authValidators.js";
import bcrypt from "bcrypt";
import { sanitize } from "../utils/sanitize.js";
import redisClient from "../config/redis.js";
import crypto from "node:crypto";

export const logoutUser = async (req, res) => {
  try {
    const sessionId = req.signedCookies?.sid;
    if (sessionId) await redisClient.del(`session:${sessionId}`);
    res.clearCookie("sid", { httpOnly: true, signed: true, sameSite: "lax", path: "/" });
    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    res.clearCookie("sid", { httpOnly: true, signed: true, sameSite: "lax", path: "/" });
    return res.status(200).json({ message: "Logout successful" });
  }
};


export const loginUser = async (req, res) => {
  console.log("Login controller function is running");
 
  try {
    const { success, data } = loginSchema.safeParse(req.body);

    if (!success) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const { password, email } = sanitize(data);
    const user = await User.findOne({ email }).lean();
    console.log("user",user);

    if (!user) {
      return res.status(404).json({ message: "user dosen't exist" });
    }

   

 if (user.role == "Supervisor" &&
  user.accountStatus !== "active"
) {
  return res.status(403).json({
    message: "Your registration is awaiting admin approval.",
  });
}




    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credential" });
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiryTime = 7 * 24 * 60 * 60;
    const rediskey = `session:${sessionId}`;

    await redisClient.hSet(rediskey, {
      userId: user._id.toString(),
      role:user.role,
      createdAt: Date.now(),
    });
    
    await redisClient.expire(rediskey, sessionExpiryTime);

    res.cookie("sid", sessionId, {
      httpOnly: true,
      signed: true,
      sameSite: "lax",
      maxAge: sessionExpiryTime * 1000,
    });

    

    return res.status(200).json({ message: "Login successful", currentUser:user });
  } catch (err) {
    console.log(err);
    console.log(err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
