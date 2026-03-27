import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { collection, doc, getDoc, getFirestore, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-club-registration',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './club-registration.html'
})
export class ClubRegistration {
  private firestore = getFirestore(inject(FirebaseApp));
  private fb = inject(FormBuilder);

  isSubmitting = signal(false);
  submitted = signal(false);

  clubForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    // Lowercase letters/numbers with hyphen-separated segments.
    // Examples: "bwsc", "west-bay", "sailing-club-1"
    // Not allowed: leading/trailing hyphen, spaces, uppercase, special chars.
    subdomain: [
      '',
      [
        Validators.required,
        Validators.maxLength(12),
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ],
    ],
    contactName: ['', [Validators.required, Validators.minLength(2)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    burgeeUrl: ['', [Validators.pattern(/https?:\/\/.+/)]]
  });

  async onSubmit() {
    const form = this.clubForm.getRawValue();
    const subdomainControl = this.clubForm.controls.subdomain;
    const subdomain = (form.subdomain || '').toLowerCase().trim();

    // Normalize to lowercase before running validators/uniqueness checks.
    subdomainControl.setValue(subdomain, { emitEvent: false });
    subdomainControl.updateValueAndValidity({ emitEvent: false });

    if (this.clubForm.invalid) return;

    const contactName = form.contactName || '';
    const contactEmail = form.contactEmail || '';
    const clubName = form.name || '';
    const burgeeUrl = form.burgeeUrl || '';

    this.isSubmitting.set(true);

    try {
      const existingClubRef = doc(this.firestore, 'clubs', subdomain);
      const existingClub = await getDoc(existingClubRef);
      if (existingClub.exists()) {
        subdomainControl.setErrors({ ...(subdomainControl.errors || {}), notUnique: true });
        subdomainControl.markAsTouched();
        return;
      }

      const batch = writeBatch(this.firestore);
      const tenantRequestRef = doc(collection(this.firestore, 'tenant-request'));

      batch.set(tenantRequestRef, {
        id: tenantRequestRef.id,
        clubName,
        subdomain,
        burgeeUrl: burgeeUrl || null,
        contactName,
        contactEmail,
        status: 'new',
        source: 'home-site',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      this.submitted.set(true);
      this.clubForm.reset();
    } catch (err) {
      console.error('ClubRegistration: Registration failed:', err);
      alert('Failed to submit registration. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
