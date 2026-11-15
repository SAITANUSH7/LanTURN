// LanTURN 3.0: Firebase has been retired in favor of native LanTURN JWT & HTTP-Only cookie authentication.
export const app = null;
export const auth = { currentUser: null };
export const googleProvider = null;
export const onAuthStateChanged = (_auth, callback) => {
  callback(null);
  return () => {};
};
export const signInWithPopup = async () => ({ user: null });
export const signOut = async () => {};
export const signInWithEmailAndPassword = async () => ({ user: null });
export const createUserWithEmailAndPassword = async () => ({ user: null });
export const sendPasswordResetEmail = async () => {};
export const signInWithPhoneNumber = async () => ({});
export class RecaptchaVerifier {}
