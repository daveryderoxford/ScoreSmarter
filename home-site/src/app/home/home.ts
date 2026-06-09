import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: 'home.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    @keyframes bounce-slow {
      0%, 100% { transform: translateY(-5%); }
      50% { transform: translateY(0); }
    }
    .animate-bounce-slow {
      animation: bounce-slow 3s infinite ease-in-out;
    }
  `]
})
export class Home {}
