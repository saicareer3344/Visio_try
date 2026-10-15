interface LoginConfig {
  dateOfBirthISO: string;
  dateFormat: string;
  placeholderPassword: string;
}

/** Turn an ISO birthday into the configurable password format without displaying it. */
export function getBirthdayPassword(config: LoginConfig): string {
  const match = config.dateOfBirthISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return config.placeholderPassword;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return config.placeholderPassword;
  }

  const parts = { DD: day, MM: month, YYYY: year };
  return config.dateFormat.replace(/YYYY|MM|DD/g, (token) => parts[token as keyof typeof parts]);
}

export function matchesBirthdayPassword(candidate: string, config: LoginConfig): boolean {
  return candidate.trim() === getBirthdayPassword(config).trim();
}
