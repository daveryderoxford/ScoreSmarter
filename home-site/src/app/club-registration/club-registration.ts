import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { collection, doc, getDoc, getFirestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';

/** Copy of RESERVED_CLUB_IDS in firebase/functions/src/shared/club-id.ts. */
const RESERVED_CLUB_IDS = new Set([
  'www', 'auth', 'ro', 'api', 'app', 'admin', 'mail', 'email', 'support', 'help',
  'dev', 'staging', 'test-site', 'scoresmarter', 'tenant-apps', 'sys-admin',
]);

const notReserved = (control: AbstractControl): ValidationErrors | null =>
  RESERVED_CLUB_IDS.has(control.value) ? { reserved: true } : null;

@Component({
  selector: 'app-club-registration',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './club-registration.html'
})
export class ClubRegistration {
  private firestore = getFirestore(inject(FirebaseApp));
  private fb = inject(FormBuilder);

  isSubmitting = signal(false);
  submitted = signal(false);
  submittedEmail = signal('');
  submitError = signal('');

  // Lengths and patterns match the club-registrations rule in firebase/firestore.rules.
  clubForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    // Lowercase letters/numbers with hyphen-separated segments, e.g. "bwsc", "west-bay".
    subdomain: ['', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(12),
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      notReserved,
    ]],
    contactName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    contactEmail: ['', [
      Validators.required,
      Validators.maxLength(254),
      Validators.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
    ]],
  });

  /** True when the control should show its error (after it is touched). */
  showError(name: keyof typeof this.clubForm.controls, error: string): boolean {
    const control = this.clubForm.controls[name];
    return control.touched && control.hasError(error);
  }

  async onSubmit() {
    const { name, subdomain, contactName, contactEmail } = this.clubForm.controls;
    for (const control of [name, contactName, contactEmail]) control.setValue(control.value.trim());
    subdomain.setValue(subdomain.value.toLowerCase().trim());
    this.clubForm.markAllAsTouched();
    this.submitError.set('');
    if (this.clubForm.invalid) return;

    const form = this.clubForm.getRawValue();
    this.isSubmitting.set(true);

    try {
      const existingClub = await getDoc(doc(this.firestore, 'clubs', form.subdomain));
      if (existingClub.exists()) {
        subdomain.setErrors({ notUnique: true });
        return;
      }

      const registrationRef = doc(collection(this.firestore, 'club-registrations'));
      await setDoc(registrationRef, {
        id: registrationRef.id,
        clubName: form.name,
        subdomain: form.subdomain,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        status: 'new',
        source: 'home-site',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      this.submittedEmail.set(form.contactEmail);
      this.submitted.set(true);
      this.clubForm.reset();
    } catch (err) {
      console.error('ClubRegistration: Registration failed:', err);
      this.submitError.set('Sorry, we could not send your request. Please try again in a few minutes.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
