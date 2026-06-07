export const APP_NAME = "LeverX";
export const APP_TAGLINE = "The margin layer for DeepBook Predict.";

export function pageTitle(section?: string): string {
  return section ? `${section} — ${APP_NAME}` : APP_NAME;
}
