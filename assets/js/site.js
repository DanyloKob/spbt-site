// SPBT — прогресивне покращення. Без JS сторінка лишається повністю читабельною:
// CSS ховає [data-reveal] тільки під .js, а failsafe в <head> знімає це через 2.5 с,
// якщо цей модуль так і не завантажився.
clearTimeout(window.__spbtFailsafe);

/* ─── Тінь під навбаром, коли сторінку прокрутили ────────────────────────── */
const nav = document.querySelector('[data-nav]');
if (nav) {
  const sync = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
}

/* ─── Поява блоків при скролі ────────────────────────────────────────────── */
const reveals = [...document.querySelectorAll('[data-reveal]')];

if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
  );

  // Сусідні елементи вилітають каскадом, а не всі разом.
  reveals.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
    io.observe(el);
  });
}
