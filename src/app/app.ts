import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private pid: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.pid)) return;
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const overlay = document.getElementById('mobile-overlay');
        const url = e.urlAfterRedirects as string;
        const isOperator  = url.startsWith('/dashboard/operator');
        const isSuperOp   = url.startsWith('/dashboard/superoperario');
        const isAuth      = url.startsWith('/auth/');
        // Vistas de coordinador ya adaptadas a móvil (el Gantt sigue requiriendo escritorio)
        const isCoordMobileReady =
          /^\/dashboard\/coordinator\/(home|evidences|project\/\d+)/.test(url);
        if (overlay) overlay.style.display = (isOperator || isSuperOp || isAuth || isCoordMobileReady) ? 'none' : '';
        document.body.classList.toggle('operator-mode', isOperator);
      });
  }
}
