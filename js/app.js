const galleryTrack = document.querySelector(".gallery-track");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const heroCarousel = document.querySelector(".hero-carousel");
const heroTrack = document.querySelector(".hero-track");
const visibleHeroSlides = 3;
const categoryTitle = document.querySelector(".category-title");
const categoryButtons = document.querySelectorAll(".category-button");
const categories = {
	freestyle: {
		name: "Freestyle",
		folder: "Freestyle",
		photos: ["DSC_0006.jpg", "DSC_0233.jpg", "DSC_0383.jpg", "DSC_0605.jpg", "DSC_0934.jpg", "DSC_1046.jpg"]
	},
	produ: {
		name: "Produ",
		folder: "Produ",
		photos: ["DSC_0044-2.jpg", "DSC_0875.jpg", "DSC_0951.jpg", "DSC_1061.jpg", "DSC_1290.jpg", "DSC_1386.jpg", "DSC_1590.jpg", "DSC_1633.jpg"]
	}
};
let currentPhoto = 0;
let currentHeroSlide = 0;
let currentCategory = "freestyle";

function showPhoto(index) {
	const totalPhotos = categories[currentCategory].photos.length;
	currentPhoto = (index + totalPhotos) % totalPhotos;
	galleryTrack.style.transform = `translateX(-${currentPhoto * 100}%)`;
	galleryTrack.style.transition = "transform 0.4s ease";
}

previousButton.addEventListener("click", () => showPhoto(currentPhoto - 1));
nextButton.addEventListener("click", () => showPhoto(currentPhoto + 1));

function renderCategory(categoryKey) {
	const category = categories[categoryKey];
	currentCategory = categoryKey;
	categoryTitle.textContent = category.name;
	categoryButtons.forEach((button) => {
		button.classList.toggle("active", button.dataset.category === categoryKey);
	});

	const imagePath = (fileName) => `fotos/${category.folder}/${fileName}`;
	heroTrack.innerHTML = category.photos.map((fileName, index) =>
		`<img class="hero-slide" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}">`
	).join("");
	category.photos.slice(0, visibleHeroSlides).forEach((fileName, index) => {
		heroTrack.insertAdjacentHTML("beforeend", `<img class="hero-slide" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}">`);
	});

	galleryTrack.innerHTML = category.photos.map((fileName, index) =>
		`<article class="photo-card">
			<img class="photo-placeholder" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}">
			<div class="caption"><span>${String(index + 1).padStart(2, "0")}</span><span>${category.name}</span></div>
		</article>`
	).join("");

	currentPhoto = 0;
	currentHeroSlide = 0;
	showPhoto(0);
	moveHeroCarousel(false);
}

function moveHeroCarousel(withAnimation = true) {
	const slideDistance = heroCarousel.clientWidth / visibleHeroSlides + 4;
	heroTrack.style.transition = withAnimation ? "transform 0.8s ease" : "none";
	heroTrack.style.transform = `translateX(-${currentHeroSlide * slideDistance}px)`;
}

categoryButtons.forEach((button) => {
	button.addEventListener("click", () => {
		renderCategory(button.dataset.category);
	});
});

setInterval(() => {
	currentHeroSlide += 1;
	moveHeroCarousel();

	if (currentHeroSlide === categories[currentCategory].photos.length) {
		setTimeout(() => {
			currentHeroSlide = 0;
			moveHeroCarousel(false);
		}, 800);
	}
}, 3000);

window.addEventListener("resize", () => moveHeroCarousel(false));
renderCategory("freestyle");
