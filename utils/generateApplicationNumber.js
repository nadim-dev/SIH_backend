import Counter from "../models/counterModel.js";

export const generateApplicationNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: "application" },
    { $inc: { sequence: 1 } },
    {
      returnDocument: "after",
      upsert: true
    }
  );

  const year = new Date().getFullYear();
  const sequence = String(counter.sequence).padStart(3, "0");
  return `NAWI-${year}-${sequence}`;
};
