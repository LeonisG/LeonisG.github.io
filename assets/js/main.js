document.addEventListener("DOMContentLoaded", () => {
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.querySelector(".nav-menu");

  /* ── Active nav link ──────────────────────────────────── */
  (function markActiveNavLink() {
    const currentPath = window.location.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/$/, "") || "/";
    document.querySelectorAll(".nav-menu a:not(.cta-primary)").forEach((link) => {
      const href = (link.getAttribute("href") || "")
        .split("#")[0]
        .replace(/\/index\.html$/, "")
        .replace(/\/$/, "") || "/";
      const isHome = href === "/" && (currentPath === "/" || currentPath === "");
      const isSection = href !== "/" && currentPath.startsWith(href);
      if (isHome || isSection) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    });
  })();
  const form = document.querySelector(".form");
  const emailInput = document.querySelector("#email");
  const formMessage = document.querySelector("#form-message");
  const revealItems = document.querySelectorAll(".reveal");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  if (form && emailInput && formMessage) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
    
      const email = emailInput.value.trim();
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
      if (!email) {
        formMessage.textContent = "Introduce tu email para continuar.";
        return;
      }
    
      if (!isValid) {
        formMessage.textContent = "Parece que el email no es válido.";
        return;
      }
    
      formMessage.textContent = "Enviando...";
    
      try {
        const response = await fetch(
          "https://leonis-worker.adrianleonisgarcia.workers.dev/subscribe",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
          }
        );
      
        const data = await response.json();
        console.log("Worker response:", data);
      
        if (!response.ok) {
          formMessage.textContent =
            data.error || "No se pudo completar la suscripción.";
          return;
        }
      
        formMessage.textContent =
          "Suscripción completada. Revisa tu correo si hay confirmación pendiente.";
        form.reset();
      } catch (error) {
        console.error("Newsletter error:", error);
        formMessage.textContent =
          "Ha ocurrido un error al conectar con la newsletter.";
      }
    });
  }

  if ("IntersectionObserver" in window && revealItems.length > 0) {
    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            currentObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  /* ── Modal de bienvenida ─────────────────────────────────── */
  (function initWelcomeModal() {
    const STORAGE_KEY = "leonis_newsletter_welcome_seen_v1";
    const DELAY_MS = 5000;

    // Solo en la home
    const path = window.location.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/$/, "") || "/";
    if (path !== "/") return;

    // Ya visto
    if (localStorage.getItem(STORAGE_KEY)) return;

    const modal = document.getElementById("welcome-modal");
    if (!modal) return;

    const closeBtn = document.getElementById("welcome-modal-close");
    const primaryCta = document.getElementById("welcome-modal-primary");
    const secondaryCta = document.getElementById("welcome-modal-secondary");
    let openTimeout;

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      localStorage.setItem(STORAGE_KEY, "true");
    }

    // Escape y focus trap
    modal.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("is-open")) return;
      if (e.key === "Escape") { closeModal(); return; }
      if (e.key === "Tab") {
        const focusables = Array.from(modal.querySelectorAll(
          "button, a[href], [tabindex]:not([tabindex='-1'])"
        ));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // Clic en el backdrop
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (secondaryCta) secondaryCta.addEventListener("click", closeModal);
    if (primaryCta) primaryCta.addEventListener("click", closeModal);

    openTimeout = setTimeout(openModal, DELAY_MS);

    window.addEventListener("pagehide", () => clearTimeout(openTimeout), { once: true });
  })();
});
