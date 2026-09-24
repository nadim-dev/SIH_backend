import z from "zod";

export const registerInstrumentSchema = z.object({
  manufacturer: z.string().trim().min(2, 'Manufacturer name is required'),
  modelNumber: z.string().trim().min(1, 'Model number is required'),
  serialNumber: z.string().trim().min(1, 'Serial number is required'),
  instrumentType: z.enum([
    'Bench Scale',
    'Platform Scale',
    'Counter / Retail Scale',
    'Precision / Analytical Balance',
    'Crane / Hanging Scale',
    'Weighbridge / Vehicle Scale'
  ]),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII']),
  unit: z.enum(['kg', 'g', 'mg', 't']),
  technology: z.enum(['Electronic', 'Mechanical']).default('Electronic'),
  indicationType: z.enum(['Digital', 'Analog']).default('Digital'),
  tareDevice: z.enum(['Yes', 'No']).default('Yes'),
  tareType: z.enum(['Additive', 'Subtractive']).default('Subtractive'),
  maximumTare: z.string().refine((val) => !isNaN(val) && Number(val) >= 0, 'Maximum tare must be >= 0').default('0'),
  hasPrintingDevice: z.preprocess(
    (value) => value === true || value === 'true' || value === 'Yes',
    z.boolean(),
  ).default(false),
  max: z.string().refine((val) => !isNaN(val) && Number(val) > 0, 'Max must be > 0'),
  min: z.string().refine((val) => !isNaN(val) && Number(val) > 0, 'Min must be > 0'),
  e: z.string().refine((val) => !isNaN(val) && Number(val) > 0, 'e must be > 0'),
  d: z.string().refine((val) => !isNaN(val) && Number(val) > 0, 'd must be > 0')
});

export const observationsSchema = z.object({
  readings: z
    .array(
      z.object({
        step: z.number().int().nonnegative(),
        indicated: z.coerce.number().finite(),
        deltaL: z.coerce.number().finite(),
      }),
    )
    .length(9),
  overallResult: z.enum(["PASS", "FAIL"]).optional(),
});

export const eccentricityObservationsSchema = z.object({
  testLoad: z.coerce.number().finite().positive(),
  positions: z.array(z.object({
    step: z.number().int().min(1).max(5),
    indicated: z.coerce.number().finite(),
    deltaL: z.coerce.number().finite(),
  })).length(5),
});
