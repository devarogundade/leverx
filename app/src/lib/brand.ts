export const APP_NAME = "LeverX";
export const APP_TAGLINE = "Leveraged trading on price predictions.";

export function pageTitle(section?: string): string {
  return section ? `${section} — ${APP_NAME}` : APP_NAME;
}
