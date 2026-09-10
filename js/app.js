const galleryTrack = document.querySelector(".gallery-track");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const photos = document.querySelectorAll(".photo-card");
const heroCarousel = document.querySelector(".hero-carousel");
const heroTrack = document.querySelector(".hero-track");
const heroSlides = [...document.querySelectorAll(".hero-slide")];
const visibleHeroSlides = 3;
let currentPhoto = 0;
let currentHeroSlide = 0;

function showPhoto(index) {
	currentPhoto = (index + photos.length) % photos.length;
	galleryTrack.style.transform = `translateX(-${currentPhoto * 100}%)`;
	galleryTrack.style.transition = "transform 0.4s ease";
}

previousButton.addEventListener("click", () => showPhoto(currentPhoto - 1));
nextButton.addEventListener("click", () => showPhoto(currentPhoto + 1));

showPhoto(0);

heroSlides.slice(0, visibleHeroSlides).forEach((slide) => {
	heroTrack.appendChild(slide.cloneNode(true));
});

function moveHeroCarousel(withAnimation = true) {
	const slideDistance = heroCarousel.clientWidth / visibleHeroSlides + 4;
	heroTrack.style.transition = withAnimation ? "transform 0.8s ease" : "none";
	heroTrack.style.transform = `translateX(-${currentHeroSlide * slideDistance}px)`;
}

setInterval(() => {
	currentHeroSlide += 1;
	moveHeroCarousel();

	if (currentHeroSlide === heroSlides.length) {
		setTimeout(() => {
			currentHeroSlide = 0;
			moveHeroCarousel(false);
		}, 800);
	}
}, 3000);

window.addEventListener("resize", () => moveHeroCarousel(false));
moveHeroCarousel(false);
