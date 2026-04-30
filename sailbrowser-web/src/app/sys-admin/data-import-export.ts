
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Toolbar } from 'app/shared/components/toolbar';
import { collection, getDocs, writeBatch, doc, getFirestore } from '@angular/fire/firestore';
import { FirebaseApp } from '@angular/fire/app';
import { ScoreSmarterError } from '../shared/utils/scoresmarter-error';

@Component({
   selector: 'app-system-data',
   imports: [
      MatButtonModule,
      MatFormFieldModule,
      MatInputModule,
      FormsModule,
      Toolbar
   ],
   template: `
    <app-toolbar title="System Data Utility"/>
    <div class="container">
      <p class="description">
        Generic utility to import/export collections. 
        Enter the path to the collection (e.g. <code>systemdata</code> or <code>systemdata/config/settings</code>).
      </p>

      <mat-form-field class="full-width">
        <mat-label>Collection Path</mat-label>
        <input matInput [(ngModel)]="path" placeholder="e.g. systemdata">
      </mat-form-field>

      <div class="actions">
        <button matButton="tonal" (click)="exportJson()" [disabled]="busy() || !path()">
          Export JSON
        </button>
        
        <button matButton="outlined" (click)="fileInput.click()" [disabled]="busy() || !path()">
          Import JSON
        </button>
        <input #fileInput type="file" (change)="importJson($event)" style="display:none" accept=".json">
      </div>

      @if (msg()) {
        <div class="message">{{ msg() }}</div>
      }
    </div>
  `,
   styles: `
    .container {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .description {
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      gap: 16px;
    }
    .full-width {
      width: 100%;
    }
    .message {
      padding: 10px;
      background-color: var(--mat-sys-surface-container);
      border-radius: 4px;
    }
  `,
   changeDetection: ChangeDetectionStrategy.OnPush
})
export class SystemDataComponent {
   private firestore = getFirestore(inject(FirebaseApp));

   path = signal('systemdata');
   busy = signal(false);
   msg = signal('');

   async exportJson() {
      this.busy.set(true);
      this.msg.set('Reading collection...');
      try {
         const colRef = collection(this.firestore, this.path());
         const snapshot = await getDocs(colRef);

         if (snapshot.empty) {
            this.msg.set('No documents found in this collection.');
            return;
         }

         // Map documents to include their ID
         const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

         // Create and download blob
         const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `${this.path().replace(/\//g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
         a.click();
         window.URL.revokeObjectURL(url);

         this.msg.set(`Successfully exported ${data.length} documents.`);
      } catch (e: any) {
         this.msg.set(`Export Error: ${e.message}`);
      } finally {
         this.busy.set(false);
      }
   }

   async importJson(event: Event) {
      const input = event.target as HTMLInputElement;
      if (!input.files?.length) return;

      const file = input.files[0];
      this.busy.set(true);
      this.msg.set('Parsing file...');

      const reader = new FileReader();
      reader.onload = async (e) => {
         try {
            const json = JSON.parse(e.target?.result as string);
            if (!Array.isArray(json)) throw new ScoreSmarterError('JSON file must contain an array of objects.');

            this.msg.set(`Importing ${json.length} documents...`);

            const colRef = collection(this.firestore, this.path());
            const batchSize = 500;
            let batch = writeBatch(this.firestore);
            let count = 0;
            let total = 0;

            for (const item of json) {
               if (!item || typeof item !== 'object') continue;

               // Extract ID if present, otherwise auto-ID
               const { id, ...data } = item;
               const docRef = id ? doc(colRef, id) : doc(colRef);

               // Use merge: true to prevent wiping fields not in the JSON (optional, but safer)
               batch.set(docRef, data, { merge: true });

               count++;
               total++;

               // Commit batches of 500
               if (count >= batchSize) {
                  await batch.commit();
                  batch = writeBatch(this.firestore);
                  count = 0;
               }
            }

            if (count > 0) {
               await batch.commit();
            }

            this.msg.set(`Successfully imported ${total} documents.`);
         } catch (err: any) {
            this.msg.set(`Import Error: ${err.message}`);
         } finally {
            this.busy.set(false);
            input.value = ''; // Reset file input
         }
      };
      reader.readAsText(file);
   }
}
