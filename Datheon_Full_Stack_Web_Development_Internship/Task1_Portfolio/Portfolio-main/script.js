// =========================
// PAGE LOAD
// =========================

document.addEventListener("DOMContentLoaded", () => {

    // Add loaded class
    document.body.classList.add("loaded");


    // =========================
    // NAVBAR SCROLL EFFECT
    // =========================

    const header = document.querySelector("header");

    window.addEventListener("scroll", () => {

        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }

    });


    // =========================
    // SCROLL REVEAL
    // =========================

    const sections = document.querySelectorAll("section");

    const observer = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {
                    entry.target.classList.add("show");
                }

            });

        },
        {
            threshold: 0.15
        }
    );


    sections.forEach((section) => {
        observer.observe(section);
    });


    // =========================
    // PROJECT HOVER
    // =========================

    const projectCards = document.querySelectorAll(".project-card");

    projectCards.forEach((card) => {

        card.addEventListener("mouseenter", () => {
            card.style.transform = "translateY(-8px)";
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "translateY(0)";
        });

    });


    // =========================
    // CURRENT YEAR
    // =========================

    const year = document.querySelector("footer div:last-child");

    if (year) {
        year.textContent = `© ${new Date().getFullYear()}`;
    }

});
