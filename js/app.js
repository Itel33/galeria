const galleryTrack = document.querySelector(".gallery-track");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const heroCarousel = document.querySelector(".hero-carousel");
const heroTrack = document.querySelector(".hero-track");
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
	},
	viajes: {
		name: "Viajes",
		folder: "Viajes",
		photos: [
			"20260203_232255.jpg", "20260205_113505.jpg", "20260205_114338.jpg", "20260206_184902.jpg", "20260208_094831.jpg", "20260208_133429.jpg",
			"DSCN4031.JPG", "DSCN4058.JPG", "DSCN4142.JPG", "DSCN4174.JPG", "DSCN4246.JPG", "DSCN4273.JPG", "DSCN4324.JPG",
			"DSCN4340.JPG", "DSCN4341.JPG", "DSCN4342.JPG", "DSCN4416.JPG", "DSCN4418.JPG", "DSCN4425.JPG", "DSCN4430.JPG"
		]
	}
};
const produHorizontalPhotos = new Set(["DSC_0044-2.jpg", "DSC_1061.jpg", "DSC_1290.jpg", "DSC_1386.jpg"]);
let currentPhoto = 0;
let currentHeroSlide = 0;
let currentCategory = "freestyle";
let heroGroups = [];

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
	document.body.style.setProperty(
		"--category-background",
		`url("fotos/${category.folder}/${category.photos[0]}")`
	);
	document.body.style.backgroundImage = `linear-gradient(rgba(17, 17, 17, .68), rgba(17, 17, 17, .88)), url("fotos/${category.folder}/${category.photos[0]}")`;
	categoryTitle.textContent = category.name;
	categoryButtons.forEach((button) => {
		button.classList.toggle("active", button.dataset.category === categoryKey);
	});

	const imagePath = (fileName) => `fotos/${category.folder}/${fileName}`;
	heroGroups = createHeroGroups(categoryKey);
	const renderGroup = (group) => `<div class="hero-slide-group" data-count="${group.length}">${group.map((fileName, index) =>
		`<div class="hero-slide-frame"><img class="hero-slide" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}"></div>`
	).join("")}</div>`;
	heroTrack.innerHTML = heroGroups.map(renderGroup).join("") + renderGroup(heroGroups[0]);

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

function createHeroGroups(categoryKey) {
	const photos = categories[categoryKey].photos;
	const groups = [];

	if (categoryKey === "produ") {
		let portraitGroup = [];
		photos.forEach((fileName) => {
			if (produHorizontalPhotos.has(fileName)) {
				if (portraitGroup.length) groups.push(portraitGroup);
				portraitGroup = [];
				groups.push([fileName]);
			} else {
				portraitGroup.push(fileName);
				if (portraitGroup.length === 2) {
					groups.push(portraitGroup);
					portraitGroup = [];
				}
			}
		});
		if (portraitGroup.length) groups.push(portraitGroup);
		return groups;
	}

	for (let index = 0; index < photos.length; index += 3) {
		groups.push(photos.slice(index, index + 3));
	}
	return groups;
}

function moveHeroCarousel(withAnimation = true) {
	heroTrack.style.transition = withAnimation ? "transform 0.8s ease" : "none";
	heroTrack.style.transform = `translateX(-${currentHeroSlide * 100}%)`;
}

categoryButtons.forEach((button) => {
	button.addEventListener("click", () => {
		renderCategory(button.dataset.category);
	});
});

setInterval(() => {
	currentHeroSlide += 1;
	moveHeroCarousel();

	if (currentHeroSlide === heroGroups.length) {
		setTimeout(() => {
			currentHeroSlide = 0;
			moveHeroCarousel(false);
		}, 800);
	}
}, 3000);

window.addEventListener("resize", () => moveHeroCarousel(false));
renderCategory("freestyle");
