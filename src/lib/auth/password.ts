export const passwordRequirement =
  "Use at least 8 characters, including a letter and a number.";

export function meetsPasswordRequirements(password: string) {
  return /^(?=.*[a-z])(?=.*\d).{8,}$/i.test(password);
}
