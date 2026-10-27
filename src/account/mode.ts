let demo = false;
let localUser: string | null = null;
export const isDemoMode = () => demo;
export function setDemoMode(value: boolean) {
  demo = value;
}
export const localAccountUser = () => localUser;
export function setLocalAccountUser(value: string | null) {
  localUser = value;
}
