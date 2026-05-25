import { HttpsError } from 'firebase-functions/https';
import { ForecastData } from './forcast.model.js';

/** Fixed forecast window stored in cache. */
export const FORECAST_HOURS = 24;

/**
 * Returns up to 24 hours of forecast data from met office
 */
export async function getMetOfficeForcast(apiKey: string, latitude: number, longitude: number
): Promise<ForecastData[]> {

  const url = new URL("https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly");
  url.searchParams.append("latitude", latitude.toString());
  url.searchParams.append("longitude", longitude.toString());

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      throw new Error(`Met Office API responded with status ${response.status}`);
    }

    const readings = parseMetOfficeResponse(await response.json());

    return readings;

  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    if (err.name === "TimeoutError") {
      throw new HttpsError("deadline-exceeded", "The weather server took too long to respond.");
    }
    throw new HttpsError("internal", "Failed to retrieve fresh forecast data.");
  }
}

/** Parses Met Office hourly series and keeps the next {@link FORECAST_HOURS} slots. */
function parseMetOfficeResponse(responseData: unknown): ForecastData[] {
  const timeSeries = (
    responseData as { features?: Array<{ properties?: { timeSeries?: unknown[]; }; }>; }
  )?.features?.[0]?.properties?.timeSeries;

  if (!Array.isArray(timeSeries)) {
    throw new Error("Met Office response missing timeSeries");
  }

  return timeSeries.slice(0, FORECAST_HOURS).map((slot: unknown) => {
    const row = slot as Record<string, unknown>;
    return {
      time: String(row["time"]),
      windSpeedKnots: Math.round(Number(row["windSpeed10m"]) * 1.94384 * 10) / 10,
      windGustKnots: Math.round(Number(row["windGustSpeed10m"]) * 1.94384 * 10) / 10,
      windDirectionDegrees: Number(row["windDirectionFrom10m"]),
      feelsLikeTemp: Number(row["feelsLikeTemperature"]),
    };
  });
}

