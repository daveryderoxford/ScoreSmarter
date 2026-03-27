import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { collection, doc, getDoc, getFirestore, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-club-registration',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink],
  templateUrl: './club-registration.html'
})
export class ClubRegistration {
  private firestore = getFirestore(inject(FirebaseApp));
  private fb = inject(FormBuilder);

  isSubmitting = signal(false);
  submitted = signal(false);

  clubForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    subdomain: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    contactName: ['', [Validators.required, Validators.minLength(2)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    burgeeUrl: ['', [Validators.pattern(/https?:\/\/.+/)]]
  });

  async onSubmit() {
    if (this.clubForm.invalid) return;

    const form = this.clubForm.getRawValue();
    const subdomain = (form.subdomain || '').toLowerCase();
    const contactName = form.contactName || '';
    const contactEmail = form.contactEmail || '';
    const clubName = form.name || '';
    const burgeeUrl = form.burgeeUrl || '';

    this.isSubmitting.set(true);

    try {
      const subdomainControl = this.clubForm.controls.subdomain;
      const existingClubRef = doc(this.firestore, 'clubs', subdomain);
      const existingClub = await getDoc(existingClubRef);
      if (existingClub.exists()) {
        subdomainControl.setErrors({ ...(subdomainControl.errors || {}), notUnique: true });
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
