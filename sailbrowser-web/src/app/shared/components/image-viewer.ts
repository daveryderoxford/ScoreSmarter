import { 
  Component, 
  ElementRef, 
  viewChild, 
  signal, 
  input, 
  computed, 
  HostListener, 
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div 
      #container 
      class="viewer-container"
      (mousedown)="onMouseDown($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd()"
      (touchcancel)="onTouchEnd()"
      (wheel)="onWheel($event)"
    >
      <!-- The Image -->
      <img
        #image 
        [src]="src()" 
        (load)="onImageLoad()"
        class="viewer-image"
        [style.transform]="transform()"
        draggable="false"
        alt="Result Sheet"
      />

      <!-- Controls Overlay -->
      <div
        class="viewer-controls"
        (mousedown)="$event.stopPropagation()"
        (touchstart)="$event.stopPropagation()"
      >
        <button mat-icon-button (click)="zoomOut()" title="Zoom Out" class="control-btn">
          <mat-icon>remove</mat-icon>
        </button>
        <div class="zoom-label">
          {{ zoomPercent() }}%
        </div>
        <button mat-icon-button (click)="zoomIn()" title="Zoom In" class="control-btn">
          <mat-icon>add</mat-icon>
        </button>
        <div class="divider"></div>
        <button mat-icon-button (click)="resetView()" title="Fit to screen" class="control-btn">
          <mat-icon>fullscreen_exit</mat-icon>
        </button>
      </div>

      <!-- Loading State -->
      @if (!isLoaded()) {
        <div class="loading-overlay">
          <div class="loading-content">
            <mat-icon class="loading-icon">image</mat-icon>
            <span class="loading-text">Loading...</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .viewer-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      touch-action: none;
      background-color: #18181b; /* zinc-900 */
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }

    .viewer-image {
      max-width: none;
      transition: transform 75ms ease-out;
      user-select: none;
    }

    .viewer-controls {
      position: absolute;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(12px);
      padding: 0.5rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      z-index: 10;
    }

    .control-btn {
      color: white !important;
    }

    .zoom-label {
      min-width: 60px;
      text-align: center;
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .divider {
      width: 1px;
      height: 1.5rem;
      background-color: rgba(255, 255, 255, 0.2);
      margin: 0 0.25rem;
    }

    .loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #18181b;
      z-index: 0;
    }

    .loading-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: #71717a; /* zinc-500 */
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    .loading-icon {
      transform: scale(1.5);
      margin-bottom: 0.5rem;
    }

    .loading-text {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
  `]
})
export class ImageViewerComponent implements AfterViewInit, OnDestroy {
  src = input.required<string>();
  
  container = viewChild<ElementRef<HTMLDivElement>>('container');
  imageElement = viewChild<ElementRef<HTMLImageElement>>('image');

  // State
  scale = signal(1);
  position = signal({ x: 0, y: 0 });
  isLoaded = signal(false);

  // Derived
  transform = computed(() => {
    const { x, y } = this.position();
    return `translate(${x}px, ${y}px) scale(${this.scale()})`;
  });

  zoomPercent = computed(() => Math.round(this.scale() * 100));

  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(() => this.resetView());
    const el = this.container()?.nativeElement;
    if (el) this.resizeObserver.observe(el);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  onImageLoad() {
    this.isLoaded.set(true);
    this.resetView();
  }

  resetView() {
    const container = this.container()?.nativeElement;
    const img = this.imageElement()?.nativeElement;

    if (!container || !img || !this.isLoaded()) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    
    // Fit image inside container while maintaining aspect ratio
    const fitScale = Math.min(scaleX, scaleY, 1);

    this.scale.set(fitScale);
    this.position.set({ x: 0, y: 0 });
  }

  zoomIn() {
    this.scale.update(s => Math.min(s * 1.2, 5));
  }

  zoomOut() {
    this.scale.update(s => Math.max(s / 1.2, 0.1));
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.scale.update(s => Math.min(Math.max(s * delta, 0.1), 5));
  }

  // --- Handlers for Panning ---

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    const dx = event.clientX - this.lastMousePos.x;
    const dy = event.clientY - this.lastMousePos.y;

    this.position.update(p => ({ x: p.x + dx, y: p.y + dy }));
    this.lastMousePos = { x: event.clientX, y: event.clientY };
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.isDragging = false;
  }

  onMouseDown(event: MouseEvent) {
    this.isDragging = true;
    this.lastMousePos = { x: event.clientX, y: event.clientY };
  }

  // --- Touch Support ---

  private lastTouchDistance = 0;

  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.isDragging = true;
      const touch = event.touches[0];
      this.lastMousePos = { x: touch.clientX, y: touch.clientY };
    } else if (event.touches.length === 2) {
      this.lastTouchDistance = this.getTouchDistance(event);
    }
  }

  @HostListener('window:touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    if (event.touches.length === 1 && this.isDragging) {
      const touch = event.touches[0];
      const dx = touch.clientX - this.lastMousePos.x;
      const dy = touch.clientY - this.lastMousePos.y;

      this.position.update(p => ({ x: p.x + dx, y: p.y + dy }));
      this.lastMousePos = { x: touch.clientX, y: touch.clientY };
    } else if (event.touches.length === 2) {
      const distance = this.getTouchDistance(event);
      const delta = distance / this.lastTouchDistance;
      this.scale.update(s => Math.min(Math.max(s * delta, 0.1), 5));
      this.lastTouchDistance = distance;
    }
  }

  onTouchEnd() {
    this.isDragging = false;
    this.lastTouchDistance = 0;
  }

  private getTouchDistance(event: TouchEvent): number {
    const t1 = event.touches[0];
    const t2 = event.touches[1];
    return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
  }
}
