import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-op-nav',
  standalone: false,
  templateUrl: './op-nav.html',
  styleUrl: './op-nav.scss',
})
export class OpNav {
  activeRoute = '';
  constructor(private router: Router) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.activeRoute = e.urlAfterRedirects);
    this.activeRoute = this.router.url;
  }
  isActive(seg: string): boolean { return this.activeRoute.includes(seg); }
  go(path: string): void { this.router.navigate(['/dashboard/operator/' + path]); }
}
