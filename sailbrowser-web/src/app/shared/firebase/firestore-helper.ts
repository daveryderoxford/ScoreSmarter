import {
   PartialWithFieldValue,
   QueryDocumentSnapshot,
   SetOptions,
   Timestamp,
   DocumentData,
   FirestoreDataConverter,
   FieldValue,
   SnapshotOptions,
   deleteField,
} from '@angular/fire/firestore';

/** Generic Firestore converter for plain data objects (no methods).
 *
 * App contract:
 * - **Read:** stored `null` becomes app `undefined` (`toAppModelRecursive`).
 * - **Full write** (`options` omitted): top-level `undefined` becomes stored `null`.
 * - **Merge / partial write** (`options` passed, e.g. `{ merge: true }`):
 *   - `undefined` omitted (leave field unchanged).
 *   - explicitly `null` becomes `deleteField()` (clear optional field).
 * - Dates become `Timestamp`s; nested plain objects recurse with the same rules.
 */
export const dataObjectConverter = <T>(): FirestoreDataConverter<T> => ({
   toFirestore(data: PartialWithFieldValue<T>, options?: SetOptions): DocumentData {
      const partialObject = options !== undefined;
      return toDbModel(data, partialObject, true);
   },
   fromFirestore: (snap: QueryDocumentSnapshot): T => {
      const data = snap.data();
      return { ...toAppModel<T>(data), id: snap.id };
   },
});

/**
 * Creates a FirestoreDataConverter for a class `T`.
 * @param constructor The class constructor, which must accept a partial object.
 * @returns A FirestoreDataConverter that handles serialization (including stripping methods)
 * and deserialization (re-instantiating the class).
 */
export function classInstanceConverter<T>(constructor: new (data: Partial<T>) => T): FirestoreDataConverter<T> {
  return {
    toFirestore(modelObject: T, options?: SetOptions): DocumentData {
      const partialObject = options !== undefined;
      // toDbModel strips functions in addition to converting types.
      return toDbModel(modelObject as PartialWithFieldValue<T>, partialObject, true);
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): T {
      const appData = toAppModel<Partial<T>>(snapshot.data(options));
      // Re-hydrate the data into a class instance.
      return new constructor({ ...appData, id: snapshot.id });
    }
  };
}
const isObject = (value: any) => (value !== null && typeof value === 'object' && !Array.isArray(value));

/**
 * Recursively converts properties of an object from App-space to DB-space.
 * - `undefined`: full writes store `null`; partial writes omit the key (no change).
 * - `null`: full writes store `null`; partial writes use `deleteField()` (explicit clear).
 * - `Date` → `Timestamp`.
 * - Nested plain objects recurse; arrays map elements (Firestore does not allow `undefined` in arrays).
 */
export function toDbModel<T>(data: PartialWithFieldValue<T>, partialUpdate: boolean, stripId = false): DocumentData {
   const result: DocumentData = {};
   
   for (let [key, value] of Object.entries(data as Object)) {
      if (stripId && key === 'id') continue;

      value = value as any;

      // Strip functions that should not be serialised. 
      if (typeof value === 'function') continue;

      if (value === null) {
         if (partialUpdate) {
            result[key] = deleteField();
         } else {
            result[key] = null;
         }
      } else if (value === undefined) {
         if (partialUpdate) {
            continue;
         } else {
            result[key] = null;
         }
      } else if (value instanceof Date) {
         result[key] = Timestamp.fromDate(value);
      } else if (Array.isArray(value)) { // Firestore does not support `undefined` in arrays.
         result[key] = value.map(item => {
            if (item === undefined) return null;
            if (item instanceof Date) return Timestamp.fromDate(item);
            if (isObject(item) && !(item instanceof Timestamp) && !(item instanceof FieldValue)) {
               return toDbModel(item, partialUpdate);
            }
            return item;
         });
      } else if (isObject(value) &&
         !(value instanceof Timestamp) &&
         !(value instanceof FieldValue)) {
         result[key] = toDbModel(value as PartialWithFieldValue<unknown>, partialUpdate);
      } else {
         result[key] = value;
      }
   }
   return result;
}

export function toAppModel<T>(data: DocumentData): T {
   return toAppModelRecursive(data) as T;
}

function toAppModelRecursive(value: any): any {
   if (value === null) {
      return undefined;
   }
   if (value instanceof Timestamp) {
      return value.toDate();
   }
   if (Array.isArray(value)) {
      return value.map(item => toAppModelRecursive(item));
   }
   if (isObject(value)) {
      // Use a generic object type to clarify we are building an app model object, not another DocumentData object.
      const result: { [key: string]: any; } = {};
      for (const [key, val] of Object.entries(value)) {
         result[key] = toAppModelRecursive(val);
      }
      return result;
   }
   return value;
}

/** 
 * Removes any invalid character from a string so it can be used as 
 * a Firestore object Id
 */
export function toFirebaseId(str: string): string {
   return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/** 
 * Generates a an Id for an object that is (statistically) gasrenteed
 * to be unique given a maximum number to items.
 * Optinally a prefix may be added to the Id
 */
export function generateSecureID(n: number, prefix?: string): string {
   const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   const targetRisk = 1e-12; // 1 in 1 trillion chance of collision

   // 1. Calculate required length based on Birthday Paradox formula:
   // length = ceil( log( (n^2) / (2 * risk) ) / log(alphabetSize) )
   const length = Math.max(1, Math.ceil(
      Math.log((n * n) / (2 * targetRisk)) / Math.log(chars.length)
   ));

   // 2. Generate the random string
   let result = '';
   const randomValues = new Uint32Array(length);
   window.crypto.getRandomValues(randomValues);

   for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
   }

   return prefix ? toFirebaseId(prefix) + '-' + result : result;
}
