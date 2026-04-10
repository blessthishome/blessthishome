const menuBtn = document.getElementById("menuBtn");
const closeBtn = document.getElementById("closeBtn");
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const toast = document.getElementById("toast");
const floatingLogo = document.getElementById("floatingLogo");

function openMenu(){
  sidebar.classList.add("open");
  backdrop.classList.add("open");
  sidebar.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeMenu(){
  sidebar.classList.remove("open");
  backdrop.classList.remove("open");
  sidebar.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

if(menuBtn) menuBtn.addEventListener("click", openMenu);
if(closeBtn) closeBtn.addEventListener("click", closeMenu);
if(backdrop) backdrop.addEventListener("click", closeMenu);

if(sidebar){
  sidebar.addEventListener("click", (e) => {
    const target = e.target;
    if(target && target.getAttribute && target.getAttribute("data-close") === "1"){
      closeMenu();
    }
  });
}

document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a");
  if(!anchor) return;

  const href = anchor.getAttribute("href") || "";
  if(href.startsWith("#")){
    e.preventDefault();
    const target = document.querySelector(href);
    if(target){
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    closeMenu();
  }
});

function showToast(message){
  if(!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1700);
}

const revealEls = Array.from(document.querySelectorAll(".reveal"));
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if(entry.isIntersecting){
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.16 });

revealEls.forEach((el) => revealObserver.observe(el));

let lastY = 0;
let ticking = false;

function onScroll(){
  lastY = window.scrollY || 0;
  if(!ticking){
    window.requestAnimationFrame(() => {
      if(floatingLogo){
        const drift = Math.min(44, lastY * -0.04);
        floatingLogo.style.transform = `translate3d(0, ${drift}px, 0)`;
      }
      ticking = false;
    });
    ticking = true;
  }
}

window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const furnitureDonationForm = document.getElementById("furnitureDonationForm");
const formHint = document.getElementById("formHint");

if(furnitureDonationForm){
  furnitureDonationForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(furnitureDonationForm);

    try{
      const response = await fetch(furnitureDonationForm.action, {
        method: "POST",
        body: formData,
        headers: { "Accept": "application/json" }
      });

      if(response.ok){
        furnitureDonationForm.reset();
        if(formHint){
          formHint.textContent = "Submitted. Bless This Home will follow up after review.";
        }
        showToast("Request submitted");
      }else{
        showToast("Submission failed. Try again.");
      }
    }catch(error){
      showToast("Network error. Try again.");
    }
  });
}
