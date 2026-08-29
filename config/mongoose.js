import mongoose from "mongoose";

export async function connectDB(){
   try{
     return await mongoose.connect(process.env.DB_URL)
   }catch(err){
      console.log(err.message);
      process.exit(1); //due to some error hamara process exit ho gya
   }
}


process.on("SIGINT",async ()=>{
 await mongoose.disconnect();
 console.log("client disconnected!");
 process.exit(0);
});