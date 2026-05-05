import { ChangeDetectionStrategy, Component, input, output, ElementRef, viewChild, computed } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type ImportExportContext = 'race-calendar' | 'boats' | 'classes' | 'fleets' | 'results';

@Component({
  selector: 'app-import-export-menu',
  imports: [MatMenuModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Import/Export options" title="Import/Export Options">
      <mat-icon>import_export</mat-icon>
    </button>
    <input #fileInput type="file" (change)="onFileSelected($event)" style="display:none" accept=".csv,.json,.xml">
    
    <mat-menu #menu="matMenu">
      @for (ctx of contexts(); track ctx) {
        @if (ctx === 'race-calendar') {
          <div mat-menu-item disabled class="menu-header">Races</div>
          <button mat-menu-item (click)="exportICal.emit(ctx)">
            <mat-icon>event</mat-icon>
            <span>Export races to iCal</span>
          </button>
          <button mat-menu-item (click)="exportCsv.emit(ctx)">
            <mat-icon>table_view</mat-icon>
            <span>Export races to CSV</span>
          </button>
        }

        @if (ctx === 'boats') {
          <div mat-menu-item disabled class="menu-header">Boats</div>
          <button mat-menu-item (click)="triggerImport('boats')">
            <mat-icon>upload</mat-icon>
            <span>Import Boats</span>
          </button>
          <button mat-menu-item (click)="exportCsv.emit(ctx)">
            <mat-icon>download</mat-icon>
            <span>Export Boats (CSV)</span>
          </button>
        }

        @if (ctx === 'classes') {
          <div mat-menu-item disabled class="menu-header">Classes</div>
          <button mat-menu-item (click)="triggerImport('classes')">
            <mat-icon>upload</mat-icon>
            <span>Import Classes</span>
          </button>
          <button mat-menu-item (click)="exportCsv.emit(ctx)">
            <mat-icon>download</mat-icon>
            <span>Export Classes (CSV)</span>
          </button>
        }

        @if (ctx === 'fleets') {
          <div mat-menu-item disabled class="menu-header">Fleets</div>
          <button mat-menu-item (click)="triggerImport('fleets')">
            <mat-icon>upload</mat-icon>
            <span>Import Fleets</span>
          </button>
          <button mat-menu-item (click)="exportCsv.emit(ctx)">
            <mat-icon>download</mat-icon>
            <span>Export Fleets (CSV)</span>
          </button>
        }

        @if (ctx === 'results') {
          <div mat-menu-item disabled class="menu-header">Results</div>
          <button mat-menu-item (click)="exportRya.emit(ctx)">
            <mat-icon>description</mat-icon>
            <span>Export RYA PY</span>
          </button>
          <button mat-menu-item (click)="exportWsXml.emit(ctx)">
            <mat-icon>code</mat-icon>
            <span>Export World Sailing XML</span>
          </button>
        }
      }
    </mat-menu>
  `,
  styles: `
    .menu-header {
      opacity: 0.8 !important;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      height: 32px !important;
      line-height: 32px !important;
    }
  `
})
export class ImportExportMenuComponent {
  context = input<ImportExportContext>();
  multiContext = input<ImportExportContext[]>();

  contexts = computed(() => {
    const single = this.context();
    const multi = this.multiContext();
    if (multi) return multi;
    if (single) return [single];
    return [];
  });
  
  exportICal = output<ImportExportContext>();
  exportCsv = output<ImportExportContext>();
  exportRya = output<ImportExportContext>();
  exportWsXml = output<ImportExportContext>();
  importFile = output<{ event: Event, context: ImportExportContext }>();

  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private activeImportContext: ImportExportContext | null = null;

  triggerImport(context: ImportExportContext) {
    this.activeImportContext = context;
    this.fileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event) {
    if (this.activeImportContext) {
      this.importFile.emit({ event, context: this.activeImportContext });
    } else if (this.context()) {
      this.importFile.emit({ event, context: this.context()! });
    }
  }
}

