export const reverseGeocode = async (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) return null;
    const response = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&apiKey=${encodeURIComponent(apiKey)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.features?.[0]?.properties?.formatted || null;
  } catch {
    return null;
  }
};
