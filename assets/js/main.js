document.addEventListener("DOMContentLoaded", () => {
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.querySelector(".nav-menu");
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
});
