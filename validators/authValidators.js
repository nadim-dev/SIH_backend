import * as z from "zod";

export const loginSchema = z.object({
  email: z.email("Please Enter a valid Email"),
  password: z.string().min(4,"password must be at least 4 character"),
});