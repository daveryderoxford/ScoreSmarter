import { ResourceRef } from '@angular/core';
import { rxResource, type RxResourceOptions } from '@angular/core/rxjs-interop';
import { withFirestoreListenerHandling } from './with-firestore-listener-handling';

/** Same options as {@link rxResource}, plus a logical listener name for error reporting. */
export type FirestoreListenerResourceOptions<T, R> = RxResourceOptions<T, R> & {
  name: string;
};

/**
 * Thin {@link rxResource} wrapper that applies {@link withFirestoreListenerHandling}
 * to every stream subscription. Prefer this for long-lived root collection listeners.
 *
 * Typing matches {@link rxResource}: with `defaultValue` the ref is `ResourceRef<T>`,
 * otherwise `ResourceRef<T | undefined>`.
 */
export function firestoreListenerResource<T, R>(
  options: FirestoreListenerResourceOptions<T, R> & { defaultValue: NoInfer<T> },
): ResourceRef<T>;
export function firestoreListenerResource<T, R>(
  options: FirestoreListenerResourceOptions<T, R>,
): ResourceRef<T | undefined>;
export function firestoreListenerResource<T, R>(
  options: FirestoreListenerResourceOptions<T, R>,
): ResourceRef<T> | ResourceRef<T | undefined> {
  // Create the operator here so inject() runs in the caller's injection context
  // (store field initializer), not later when `stream` is invoked.
  const handling = withFirestoreListenerHandling<T>(options.name);
  const { name: _name, stream, ...rxOptions } = options;

  return rxResource({
    ...rxOptions,
    stream: arg => stream(arg).pipe(handling),
  } as RxResourceOptions<T, R> & { defaultValue: T });
}
