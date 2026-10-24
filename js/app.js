const galleryTrack = document.querySelector(".gallery-track");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const heroTrack = document.querySelector(".hero-track");
const categoryBar = document.querySelector(".category-bar");
const categoryNav = document.querySelector(".category-nav");
const initialLoader = document.querySelector("#initial-loader");
const initialLoaderMessage = document.querySelector("#initial-loader-message");
const initialLoaderRetry = document.querySelector("#initial-loader-retry");
const backgroundLayers = document.querySelectorAll(".photo-backdrop-layer");
const gallerySection = document.querySelector(".gallery-section");
const categoryTitle = document.querySelector(".category-title");
const collectionTools = document.querySelector("#collection-tools");
const categoryButtons = document.querySelectorAll(".category-button");
const MOST_LIKED_CATEGORY_KEY = "__most-liked";
let categories = {
	freestyle: {
		name: "Freestyle",
		folder: "Freestyle",
		photos: []
	},
	viajes: {
		name: "Viajes",
		folder: "Viajes",
		photos: []
	},
};
const supabaseClient = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY
	? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
	: null;
let currentPhoto = 0;
let currentBackgroundPhoto = 0;
let activeBackgroundLayer = 0;
let currentHeroSlide = 0;
let currentCategory = "freestyle";
let heroGroups = [];
let photoCards = [];
let cloudPhotos = [];
let categoryRenderVersion = 0;
let photoOrderingAvailable = true;
let categoryOrderingAvailable = true;
let cameraMetadataAvailable = true;
let heroPortraitLimit = window.matchMedia("(max-width: 700px)").matches ? 2 : 3;
const imageDimensionsCache = new Map();
const photoPaletteCache = new Map();
let photoPaletteRequest = 0;
const pendingPhotoOrders = new Map();
let draggedPhotoId = null;
let pendingCategoryOrder = null;
let draggedCategoryKey = null;
const adminPanel = document.querySelector("#admin-panel");
const adminStatus = document.querySelector("#admin-status");
const loginForm = document.querySelector("#login-form");
const adminDashboard = document.querySelector("#admin-dashboard");
const statisticsRefresh = document.querySelector("#statistics-refresh");
const statisticsLikes = document.querySelector("#statistics-likes");
const statisticsPhotos = document.querySelector("#statistics-photos");
const statisticsCategories = document.querySelector("#statistics-categories");
const statisticsTopPhotos = document.querySelector("#statistics-top-photos");
const statisticsStatus = document.querySelector("#statistics-status");
const uploadForm = document.querySelector("#upload-form");
const editForm = document.querySelector("#edit-form");
const editCategorySelect = document.querySelector("#edit-category");
const photoManager = document.querySelector("#photo-manager");
const uploadFiles = document.querySelector("#upload-files");
const selectedFiles = document.querySelector("#selected-files");
let selectedObjectUrls = [];
let selectedFileDetails = new Map();
let selectedFilePage = 0;
const selectedFilePageSize = 20;
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
let lightboxIndex = 0;

if ("IntersectionObserver" in window && gallerySection) {
	const galleryRevealObserver = new IntersectionObserver(([entry]) => {
		if (!entry.isIntersecting) return;
		document.querySelector(".photo-backdrop")?.classList.add("gradient-visible");
		galleryRevealObserver.disconnect();
	}, { threshold: 0.1 });
	galleryRevealObserver.observe(gallerySection);
} else {
	document.querySelector(".photo-backdrop")?.classList.add("gradient-visible");
}

function categoryKeyFromName(name) {
	return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function updateCategoryNavOverflow() {
	const maxScrollLeft = categoryNav.scrollWidth - categoryNav.clientWidth;
	categoryBar.classList.toggle("has-left-overflow", categoryNav.scrollLeft > 1);
	categoryBar.classList.toggle("has-right-overflow", maxScrollLeft - categoryNav.scrollLeft > 1);
}

categoryNav.addEventListener("scroll", updateCategoryNavOverflow, { passive: true });
window.addEventListener("resize", updateCategoryNavOverflow);
requestAnimationFrame(updateCategoryNavOverflow);

function photoAccentFromUrl(imageUrl) {
	if (!photoPaletteCache.has(imageUrl)) {
		const palettePromise = new Promise((resolve, reject) => {
			const image = new Image();
			image.crossOrigin = "anonymous";
			image.onload = () => {
				try {
					const canvas = document.createElement("canvas");
					canvas.width = 24;
					canvas.height = 24;
					const context = canvas.getContext("2d", { willReadFrequently: true });
					if (!context) throw new Error("No se pudo crear el contexto para analizar el color de la foto.");
					context.drawImage(image, 0, 0, canvas.width, canvas.height);
					const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
					const buckets = new Map();
					for (let index = 0; index < pixels.length; index += 16) {
						if (pixels[index + 3] < 200) continue;
						const red = pixels[index];
						const green = pixels[index + 1];
						const blue = pixels[index + 2];
						const max = Math.max(red, green, blue);
						const min = Math.min(red, green, blue);
						const saturation = max ? (max - min) / max : 0;
						const brightness = max / 255;
						if (saturation < 0.12 || brightness < 0.16 || brightness > 0.94) continue;
						const key = [red >> 4, green >> 4, blue >> 4].join(":");
						const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, weight: 0 };
						const weight = saturation * Math.min(brightness / 0.35, 1);
						bucket.red += red * weight;
						bucket.green += green * weight;
						bucket.blue += blue * weight;
						bucket.weight += weight;
						buckets.set(key, bucket);
					}
					const strongestBucket = [...buckets.values()].sort((left, right) => right.weight - left.weight)[0];
					if (!strongestBucket) {
						resolve(null);
						return;
					}
					const soften = (value) => Math.round(value * 0.72 + 155 * 0.28);
					resolve([
						soften(strongestBucket.red / strongestBucket.weight),
						soften(strongestBucket.green / strongestBucket.weight),
						soften(strongestBucket.blue / strongestBucket.weight)
					]);
				} catch (error) {
					reject(error);
				}
			};
			image.onerror = () => reject(new Error(`No se pudo cargar la foto para analizar sus colores: ${imageUrl}`));
			image.src = imageUrl;
		});
		photoPaletteCache.set(imageUrl, palettePromise);
	}
	return photoPaletteCache.get(imageUrl);
}

async function applyPhotoPalette(imageUrl) {
	const request = ++photoPaletteRequest;
	try {
		const accent = await photoAccentFromUrl(imageUrl);
		if (request !== photoPaletteRequest) return;
		if (!accent) {
			document.documentElement.style.removeProperty("--photo-accent");
			document.documentElement.style.removeProperty("--photo-accent-soft");
			return;
		}
		document.documentElement.style.setProperty("--photo-accent", `rgb(${accent.join(" ")})`);
		document.documentElement.style.setProperty("--photo-accent-soft", `rgb(${accent.join(" ")} / 18%)`);
	} catch (error) {
		if (request === photoPaletteRequest) {
			document.documentElement.style.removeProperty("--photo-accent");
			document.documentElement.style.removeProperty("--photo-accent-soft");
		}
		console.warn("No se pudo adaptar el color de la página a la foto.", error);
	}
}

async function readCameraModel(file) {
	if (!/\.jpe?g$/i.test(file.name) && file.type !== "image/jpeg") {
		return { model: "", status: "EXIF disponible solo para archivos JPEG." };
	}

	try {
		const buffer = await file.slice(0, 2 * 1024 * 1024).arrayBuffer();
		const view = new DataView(buffer);
		if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
			return { model: "", status: "No se encontró información EXIF." };
		}

		for (let offset = 2; offset + 4 <= view.byteLength;) {
			if (view.getUint8(offset) !== 0xff) break;
			while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
			const marker = view.getUint8(offset);
			offset += 1;
			if (marker === 0xda || marker === 0xd9) break;
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
			if (offset + 2 > view.byteLength) break;

			const segmentLength = view.getUint16(offset, false);
			if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
			const segmentStart = offset + 2;
			const segmentEnd = offset + segmentLength;
			offset = segmentEnd;
			if (marker !== 0xe1 || segmentStart + 14 > segmentEnd) continue;

			const isExif = view.getUint8(segmentStart) === 0x45
				&& view.getUint8(segmentStart + 1) === 0x78
				&& view.getUint8(segmentStart + 2) === 0x69
				&& view.getUint8(segmentStart + 3) === 0x66
				&& view.getUint16(segmentStart + 4, false) === 0;
			if (!isExif) continue;

			const tiffStart = segmentStart + 6;
			const byteOrder = view.getUint16(tiffStart, false);
			if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) continue;
			const littleEndian = byteOrder === 0x4949;
			if (view.getUint16(tiffStart + 2, littleEndian) !== 42) continue;
			const directoryStart = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
			if (directoryStart + 2 > segmentEnd) continue;

			const entryCount = view.getUint16(directoryStart, littleEndian);
			let make = "";
			let model = "";
			for (let index = 0; index < entryCount; index += 1) {
				const entryStart = directoryStart + 2 + index * 12;
				if (entryStart + 12 > segmentEnd) break;
				const tag = view.getUint16(entryStart, littleEndian);
				if ((tag !== 0x010f && tag !== 0x0110) || view.getUint16(entryStart + 2, littleEndian) !== 2) continue;
				const valueCount = view.getUint32(entryStart + 4, littleEndian);
				const valueStart = valueCount <= 4
					? entryStart + 8
					: tiffStart + view.getUint32(entryStart + 8, littleEndian);
				if (!valueCount || valueStart + valueCount > segmentEnd) continue;
				let value = "";
				for (let character = 0; character < valueCount; character += 1) {
					const code = view.getUint8(valueStart + character);
					if (code === 0) break;
					value += String.fromCharCode(code);
				}
				if (tag === 0x010f) make = value.trim();
				if (tag === 0x0110) model = value.trim();
			}

			const cameraModel = make && model
				? (model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`)
				: make || model;
			if (cameraModel) return { model: cameraModel, status: "Modelo detectado desde EXIF." };
		}
		return { model: "", status: "El archivo no contiene marca y modelo en sus datos EXIF." };
	} catch {
		return { model: "", status: "No se pudieron leer los datos EXIF de este archivo." };
	}
}

function readSelectedCameraModel(file, index, details) {
	if (details.cameraModelPromise) return details.cameraModelPromise;
	details.cameraModelPromise = readCameraModel(file).then((result) => {
		if (selectedFileDetails.get(index) !== details || uploadFiles.files[index] !== file) return;
		details.cameraExifStatus = result.status;
		if (!details.cameraModelEdited) details.cameraModel = result.model;
		const cameraInput = selectedFiles.querySelector(`.selected-file-camera[data-file-index="${index}"]`);
		const status = selectedFiles.querySelector(`.camera-exif-status[data-file-index="${index}"]`);
		const sourceName = selectedFiles.querySelector(`.selected-file-source[data-file-index="${index}"]`);
		if (cameraInput && !details.cameraModelEdited) cameraInput.value = details.cameraModel;
		if (sourceName && !details.cameraModelEdited) sourceName.textContent = details.cameraModel || file.name;
		if (status) status.textContent = details.cameraExifStatus;
	});
	return details.cameraModelPromise;
}

function renderSelectedFiles() {
	selectedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
	selectedObjectUrls = [];
	const files = [...uploadFiles.files];
	const pageCount = Math.ceil(files.length / selectedFilePageSize);
	selectedFilePage = Math.min(selectedFilePage, Math.max(0, pageCount - 1));
	const start = selectedFilePage * selectedFilePageSize;
	const visibleFiles = files.slice(start, start + selectedFilePageSize);
	const rows = visibleFiles.map((file, visibleIndex) => {
		const index = start + visibleIndex;
		const objectUrl = URL.createObjectURL(file);
		selectedObjectUrls.push(objectUrl);
		const details = selectedFileDetails.get(index) || {
			displayName: file.name,
			instagram: "",
			cameraModel: "",
			cameraExifStatus: "Leyendo EXIF..."
		};
		selectedFileDetails.set(index, details);
		return `
		<div class="selected-file-row">
			<img src="${objectUrl}" alt="" loading="lazy" decoding="async">
			<div class="selected-file-fields">
				<strong class="selected-file-source" data-file-index="${index}" title="${escapeHtml(file.name)}">${escapeHtml(details.cameraModel || file.name)}</strong>
				<input data-file-index="${index}" class="selected-file-name" type="text" value="${escapeHtml(details.displayName)}" placeholder="Nombre de la foto">
				<input data-file-index="${index}" class="selected-file-camera" type="text" value="${escapeHtml(details.cameraModel)}" placeholder="Cámara o celular (EXIF)">
				<small class="camera-exif-status" data-file-index="${index}">${escapeHtml(details.cameraExifStatus)}</small>
				<input data-file-index="${index}" class="selected-file-instagram" type="text" value="${escapeHtml(details.instagram)}" placeholder="Instagram del modelo, opcional">
			</div>
		</div>`;
	}).join("");
	const pageControls = pageCount > 1 ? `
		<div class="selected-files-pagination">
			<span>Fotos ${start + 1}–${Math.min(start + selectedFilePageSize, files.length)} de ${files.length}</span>
			<button type="button" class="selected-files-page" data-step="-1" ${selectedFilePage === 0 ? "disabled" : ""}>Anterior</button>
			<button type="button" class="selected-files-page" data-step="1" ${selectedFilePage === pageCount - 1 ? "disabled" : ""}>Siguiente</button>
		</div>` : files.length ? `<div class="selected-files-count">${files.length} foto(s) seleccionada(s)</div>` : "";
	selectedFiles.innerHTML = rows + pageControls;
	selectedFiles.querySelectorAll(".selected-file-name, .selected-file-camera, .selected-file-instagram").forEach((input) => {
		input.addEventListener("input", () => {
			const index = Number(input.dataset.fileIndex);
			const details = selectedFileDetails.get(index);
			if (input.classList.contains("selected-file-name")) details.displayName = input.value;
			else if (input.classList.contains("selected-file-camera")) {
				details.cameraModel = input.value;
				details.cameraModelEdited = true;
				const sourceName = selectedFiles.querySelector(`.selected-file-source[data-file-index="${index}"]`);
				if (sourceName) sourceName.textContent = input.value.trim() || uploadFiles.files[index]?.name || "";
			} else details.instagram = input.value;
		});
	});
	visibleFiles.forEach((file, visibleIndex) => {
		const index = start + visibleIndex;
		const details = selectedFileDetails.get(index);
		readSelectedCameraModel(file, index, details);
	});
	selectedFiles.querySelectorAll(".selected-files-page").forEach((button) => {
		button.addEventListener("click", () => {
			selectedFilePage += Number(button.dataset.step);
			renderSelectedFiles();
		});
	});
}

uploadFiles.addEventListener("change", () => {
	selectedFileDetails.clear();
	selectedFilePage = 0;
	renderSelectedFiles();
});

function addCategoryToControls(categoryKey, categoryName) {
	if (!categoryKey) return;
	if (!categories[categoryKey]) categories[categoryKey] = { name: categoryName, folder: categoryKey, photos: [] };
	const categoryNav = document.querySelector(".category-nav");
	if (![...categoryNav.querySelectorAll(".category-button")].some((button) => button.dataset.category === categoryKey)) {
		const categoryButton = document.createElement("button");
		categoryButton.className = "category-button";
		categoryButton.type = "button";
		categoryButton.dataset.category = categoryKey;
		categoryButton.textContent = categoryName;
		categoryButton.addEventListener("click", () => renderCategory(categoryKey));
		const mostLikedButton = categoryNav.querySelector(`[data-category="${MOST_LIKED_CATEGORY_KEY}"]`);
		categoryNav.insertBefore(categoryButton, mostLikedButton);
		requestAnimationFrame(updateCategoryNavOverflow);
	}
	["#upload-category", "#edit-category"].forEach((selector) => {
		const categorySelect = document.querySelector(selector);
		if ([...categorySelect.options].some((option) => option.value === categoryKey)) return;
		const categoryOption = document.createElement("option");
		categoryOption.value = categoryKey;
		categoryOption.dataset.category = categoryKey;
		categoryOption.textContent = categoryName;
		categorySelect.appendChild(categoryOption);
	});
}

async function loadCloudPhotos() {
	if (!supabaseClient) return;

	let { data, error } = await supabaseClient
		.from("photos")
		.select("id, category, category_name, display_name, camera_model, instagram_url, file_name, storage_path, likes_count, sort_order, category_order")
		.order("category_order", { ascending: true })
		.order("category", { ascending: true })
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });
	cameraMetadataAvailable = !error;
	photoOrderingAvailable = !error;
	categoryOrderingAvailable = !error;
	if (error) {
		const fallback = await supabaseClient
			.from("photos")
			.select("id, category, category_name, display_name, camera_model, instagram_url, file_name, storage_path, sort_order, category_order")
			.order("category_order", { ascending: true })
			.order("category", { ascending: true })
			.order("sort_order", { ascending: true })
			.order("created_at", { ascending: true });
		if (!fallback.error) {
			data = fallback.data;
			cameraMetadataAvailable = true;
			photoOrderingAvailable = true;
			categoryOrderingAvailable = true;
		} else {
			const photoOrderFallback = await supabaseClient
				.from("photos")
				.select("id, category, category_name, display_name, camera_model, instagram_url, file_name, storage_path, sort_order")
				.order("category", { ascending: true })
				.order("sort_order", { ascending: true })
				.order("created_at", { ascending: true });
			if (!photoOrderFallback.error) {
				data = photoOrderFallback.data;
				cameraMetadataAvailable = true;
				photoOrderingAvailable = true;
				categoryOrderingAvailable = false;
			} else {
				const minimal = await supabaseClient
					.from("photos")
					.select("id, category, file_name, storage_path")
					.order("created_at", { ascending: true });
				if (minimal.error) throw minimal.error;
				data = minimal.data;
				cameraMetadataAvailable = false;
				photoOrderingAvailable = false;
				categoryOrderingAvailable = false;
			}
		}
	}
	if (!data) return;
	cloudPhotos = data;
	renderPhotoManager();
	if (!data.length) {
		refreshMostLikedCategory();
		return;
	}

	const cloudCategories = {};
	const orderedCategoryKeys = [];
	data.forEach((photo) => {
		addCategoryToControls(photo.category, photo.category_name || photo.category);
		if (!cloudCategories[photo.category]) {
			orderedCategoryKeys.push(photo.category);
			const fallback = categories[photo.category] || { name: photo.category_name || photo.category, folder: photo.category, photos: [] };
			cloudCategories[photo.category] = {
				...fallback,
				categoryOrder: photo.category_order ?? orderedCategoryKeys.length - 1,
				photos: [...fallback.photos],
				cloudUrls: { ...(fallback.cloudUrls || {}) },
				displayNames: { ...(fallback.displayNames || {}) },
				cameraModels: { ...(fallback.cameraModels || {}) },
				cloudIds: { ...(fallback.cloudIds || {}) },
				likes: { ...(fallback.likes || {}) },
				instagram: { ...(fallback.instagram || {}) }
			};
		}
		const { data: publicFile } = supabaseClient.storage.from("gallery").getPublicUrl(photo.storage_path);
		if (!cloudCategories[photo.category].photos.includes(photo.file_name)) cloudCategories[photo.category].photos.push(photo.file_name);
		cloudCategories[photo.category].cloudUrls[photo.file_name] = publicFile.publicUrl;
		cloudCategories[photo.category].displayNames = cloudCategories[photo.category].displayNames || {};
		cloudCategories[photo.category].displayNames[photo.file_name] = photo.display_name || photo.file_name;
		cloudCategories[photo.category].cameraModels = cloudCategories[photo.category].cameraModels || {};
		cloudCategories[photo.category].cameraModels[photo.file_name] = photo.camera_model || "";
		cloudCategories[photo.category].cloudIds = cloudCategories[photo.category].cloudIds || {};
		cloudCategories[photo.category].cloudIds[photo.file_name] = photo.id;
		cloudCategories[photo.category].likes = cloudCategories[photo.category].likes || {};
		cloudCategories[photo.category].likes[photo.file_name] = photo.likes_count || 0;
		cloudCategories[photo.category].instagram = cloudCategories[photo.category].instagram || {};
		cloudCategories[photo.category].instagram[photo.file_name] = photo.instagram_url || "";
	});
	categories = { ...categories, ...cloudCategories };
	applyCategoryOrder(orderedCategoryKeys);
	refreshMostLikedCategory();
}

function refreshMostLikedCategory() {
	const topPhotos = cloudPhotos
		.map((photo, index) => ({ photo, index, likes: Number(photo.likes_count) || 0 }))
		.filter(({ likes }) => likes > 0)
		.sort((left, right) => right.likes - left.likes || left.index - right.index)
		.slice(0, 7);
	const category = {
		name: "Top 7 más likeadas",
		folder: "",
		photos: [],
		cloudUrls: {},
		displayNames: {},
		cameraModels: {},
		cloudIds: {},
		likes: {},
		instagram: {}
	};

	topPhotos.forEach(({ photo, likes }, index) => {
		const photoKey = String(photo.id);
		const { data: publicFile } = supabaseClient.storage.from("gallery").getPublicUrl(photo.storage_path);
		category.photos.push(photoKey);
		category.cloudUrls[photoKey] = publicFile.publicUrl;
		category.displayNames[photoKey] = photo.display_name || photo.file_name;
		category.cameraModels[photoKey] = photo.camera_model || "";
		category.cloudIds[photoKey] = photo.id;
		category.likes[photoKey] = likes;
		category.instagram[photoKey] = photo.instagram_url || "";
	});
	categories[MOST_LIKED_CATEGORY_KEY] = category;

	const categoryNav = document.querySelector(".category-nav");
	let mostLikedButton = categoryNav.querySelector(`[data-category="${MOST_LIKED_CATEGORY_KEY}"]`);
	if (!mostLikedButton) {
		mostLikedButton = document.createElement("button");
		mostLikedButton.className = "category-button";
		mostLikedButton.type = "button";
		mostLikedButton.dataset.category = MOST_LIKED_CATEGORY_KEY;
		mostLikedButton.textContent = "Top Likes";
		mostLikedButton.addEventListener("click", () => renderCategory(MOST_LIKED_CATEGORY_KEY));
	}
	categoryNav.appendChild(mostLikedButton);
	requestAnimationFrame(updateCategoryNavOverflow);

	if (currentCategory === MOST_LIKED_CATEGORY_KEY) renderCategory(MOST_LIKED_CATEGORY_KEY);
}

function applyCategoryOrder(categoryKeys) {
	const categoryNav = document.querySelector(".category-nav");
	const orderedButtons = categoryKeys.map((key) => categoryNav.querySelector(`.category-button[data-category="${CSS.escape(key)}"]`)).filter(Boolean);
	const remainingButtons = [...categoryNav.querySelectorAll(".category-button")].filter((button) => !categoryKeys.includes(button.dataset.category));
	[...orderedButtons, ...remainingButtons].forEach((button) => categoryNav.appendChild(button));
	requestAnimationFrame(updateCategoryNavOverflow);

	["#upload-category", "#edit-category"].forEach((selector) => {
		const categorySelect = document.querySelector(selector);
		const orderedOptions = categoryKeys.map((key) => [...categorySelect.options].find((option) => option.value === key)).filter(Boolean);
		const remainingOptions = [...categorySelect.options].filter((option) => !categoryKeys.includes(option.value));
		[...orderedOptions, ...remainingOptions].forEach((option) => categorySelect.appendChild(option));
	});
}

function escapeHtml(value) {
	return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

async function loadAdminStatistics() {
	if (!supabaseClient) {
		statisticsStatus.textContent = "Supabase no está configurado; no se pueden cargar las estadísticas.";
		return;
	}
	statisticsRefresh.disabled = true;
	statisticsLikes.textContent = "—";
	statisticsPhotos.textContent = "—";
	statisticsCategories.textContent = "—";
	statisticsStatus.textContent = "Actualizando estadísticas...";
	const { data, error } = await supabaseClient
		.from("photos")
		.select("category, category_name, display_name, file_name, likes_count")
		.order("likes_count", { ascending: false });
	statisticsRefresh.disabled = false;
	if (error) {
		statisticsTopPhotos.replaceChildren();
		statisticsStatus.textContent = `No se pudieron cargar las estadísticas. Comprueba que ejecutaste supabase-setup.sql en Supabase. Detalle: ${error.message}`;
		return;
	}

	const photos = data || [];
	const totalLikes = photos.reduce((total, photo) => total + Number(photo.likes_count || 0), 0);
	const categoryNames = new Set(photos.map((photo) => photo.category));
	statisticsLikes.textContent = totalLikes.toLocaleString("es");
	statisticsPhotos.textContent = photos.length.toLocaleString("es");
	statisticsCategories.textContent = categoryNames.size.toLocaleString("es");
	const topPhotos = photos.filter((photo) => Number(photo.likes_count) > 0).slice(0, 5);
	statisticsTopPhotos.innerHTML = topPhotos.length
		? topPhotos.map((photo) => `<li>
			<span class="statistics-photo-label">
				<strong>${escapeHtml(photo.display_name || photo.file_name || "Foto sin nombre")}</strong>
				<small>${escapeHtml(photo.category_name || photo.category || "Sin temática")}</small>
			</span>
			<strong class="statistics-photo-likes">${Number(photo.likes_count).toLocaleString("es")} ♥</strong>
		</li>`).join("")
		: "";
	statisticsStatus.textContent = totalLikes
		? "Estadísticas actualizadas. No se guarda la identidad de quienes dieron like."
		: "Todavía no hay likes registrados en las fotos.";
}

function renderPhotoManager() {
	if (!cloudPhotos.length) {
		editCategorySelect.replaceChildren(new Option("Sin temáticas disponibles", ""));
		editCategorySelect.disabled = true;
		photoManager.innerHTML = "<p>Aún no hay fotos en la nube.</p>";
		return;
	}
	const grouped = cloudPhotos.reduce((groups, photo) => {
		(groups[photo.category] ||= { name: photo.category_name || photo.category, photos: [] }).photos.push(photo);
		return groups;
	}, {});
	const categoryKeys = Object.keys(grouped);
	const displayedCategoryKeys = pendingCategoryOrder
		? [...pendingCategoryOrder.filter((key) => grouped[key]), ...categoryKeys.filter((key) => !pendingCategoryOrder.includes(key))]
		: categoryKeys;
	const previousCategory = editCategorySelect.value;
	editCategorySelect.replaceChildren(...categoryKeys.map((category) => {
		const option = new Option(grouped[category].name, category);
		option.dataset.category = category;
		return option;
	}));
	editCategorySelect.disabled = false;
	editCategorySelect.value = grouped[previousCategory] ? previousCategory : categoryKeys[0];
	const selectedCategory = editCategorySelect.value;
	const category = selectedCategory;
	const group = grouped[selectedCategory];
	const categoryOrderManager = categoryKeys.length > 1 ? `
		<section class="category-order-manager">
			<h4>Ordenar temáticas</h4>
			<p>Arrastra las temáticas para cambiar su orden en la galería.</p>
			${categoryOrderingAvailable ? "" : `<p class="photo-order-warning">Para habilitar el orden de temáticas, ejecuta el archivo supabase-setup.sql actualizado en el SQL Editor de Supabase.</p>`}
			<div class="category-order-list">
				${displayedCategoryKeys.map((category) => `<div class="category-order-item" data-category="${escapeHtml(category)}" ${categoryOrderingAvailable ? 'draggable="true"' : ""}>
					<span class="category-order-handle" aria-hidden="true">⠿</span>
					<span>${escapeHtml(grouped[category].name)}</span>
				</div>`).join("")}
			</div>
			<button type="button" class="save-category-order" ${categoryOrderingAvailable ? "" : "disabled"}>Guardar orden de temáticas</button>
		</section>` : "";
	const selectedCategoryMarkup = `
		<div class="photo-manager-group" data-category="${escapeHtml(category)}">
			<label>Nombre de temática<input class="category-name-input" value="${escapeHtml(group.name)}" data-category="${escapeHtml(category)}"></label>
			<button type="button" class="delete-category" data-category="${escapeHtml(category)}">Borrar toda la temática</button>
			<button type="button" class="save-photo-order" data-category="${escapeHtml(category)}" ${photoOrderingAvailable ? "" : "disabled"}>Guardar orden</button>
			${orderedPhotosForCategory(category, group.photos).map((photo) => {
				const { data: publicFile } = supabaseClient.storage.from("gallery").getPublicUrl(photo.storage_path);
				return `<div class="photo-manager-item" data-id="${photo.id}">
					<button type="button" class="photo-order-handle" aria-label="Arrastrar para ordenar" title="Arrastra para cambiar el orden">⠿</button>
					<img src="${publicFile.publicUrl}" alt="" loading="lazy" decoding="async">
					<div class="photo-manager-fields">
						<small title="Archivo original: ${escapeHtml(photo.file_name)}">${escapeHtml(photo.camera_model || photo.file_name)}</small>
						<input class="photo-name-input" aria-label="Nombre de la foto" value="${escapeHtml(photo.display_name || photo.file_name)}" data-id="${photo.id}">
						<input class="camera-model-input" aria-label="Cámara o celular de la foto" value="${escapeHtml(photo.camera_model || "")}" placeholder="Cámara o celular (EXIF)" data-id="${photo.id}" ${cameraMetadataAvailable ? "" : "disabled"}>
						<input class="instagram-input" aria-label="Instagram del modelo" value="${escapeHtml(photo.instagram_url || "")}" placeholder="Instagram del modelo" data-id="${photo.id}">
						<button type="button" class="save-photo" data-id="${photo.id}">Guardar cambios</button>
					</div>
					<button type="button" class="delete-photo" data-id="${photo.id}" data-path="${escapeHtml(photo.storage_path)}">Borrar</button>
				</div>`;
			}).join("")}
		</div>`;
	photoManager.innerHTML = `${cameraMetadataAvailable ? "" : `<p class="photo-order-warning">Para guardar el modelo de cámara, ejecuta el archivo supabase-setup.sql actualizado en Supabase.</p>`}${photoOrderingAvailable ? "" : `<p class="photo-order-warning">Para habilitar el orden manual de las fotos, ejecuta el archivo supabase-setup.sql actualizado en el SQL Editor de Supabase.</p>`}${categoryOrderManager}${selectedCategoryMarkup}`;
	photoManager.querySelectorAll(".save-photo").forEach((button) => button.addEventListener("click", () => savePhotoDetails(button)));
	photoManager.querySelectorAll(".delete-photo").forEach((button) => button.addEventListener("click", () => deletePhoto(button)));
	photoManager.querySelectorAll(".delete-category").forEach((button) => button.addEventListener("click", () => deleteCategory(button)));
	photoManager.querySelectorAll(".save-photo-order").forEach((button) => button.addEventListener("click", () => savePhotoOrder(button)));
	const categoryOrderList = photoManager.querySelector(".category-order-list");
	if (categoryOrderList) {
		categoryOrderList.querySelectorAll(".category-order-item").forEach((item) => {
			item.addEventListener("dragstart", (event) => {
				draggedCategoryKey = item.dataset.category;
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", draggedCategoryKey);
				item.classList.add("dragging");
			});
			item.addEventListener("dragend", () => {
				draggedCategoryKey = null;
				item.classList.remove("dragging");
			});
			item.addEventListener("dragover", (event) => event.preventDefault());
			item.addEventListener("drop", (event) => {
				event.preventDefault();
				const source = categoryOrderList.querySelector(`.category-order-item[data-category="${CSS.escape(draggedCategoryKey)}"]`);
				if (!source || source === item) return;
				const items = [...categoryOrderList.querySelectorAll(".category-order-item")];
				if (items.indexOf(source) < items.indexOf(item)) categoryOrderList.insertBefore(source, item.nextSibling);
				else categoryOrderList.insertBefore(source, item);
				pendingCategoryOrder = [...categoryOrderList.querySelectorAll(".category-order-item")].map((entry) => entry.dataset.category);
				adminStatus.textContent = "Orden de temáticas cambiado. Guarda para actualizar la galería.";
			});
		});
		photoManager.querySelector(".save-category-order")?.addEventListener("click", saveCategoryOrder);
	}
	photoManager.querySelectorAll(".photo-manager-item").forEach((item) => {
		item.draggable = photoOrderingAvailable;
		item.addEventListener("dragstart", (event) => {
			draggedPhotoId = item.dataset.id;
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", draggedPhotoId);
			item.classList.add("dragging");
		});
		item.addEventListener("dragend", () => {
			draggedPhotoId = null;
			item.classList.remove("dragging");
		});
		item.addEventListener("dragover", (event) => event.preventDefault());
		item.addEventListener("drop", (event) => {
			event.preventDefault();
			const group = item.closest(".photo-manager-group");
			const source = group.querySelector(`.photo-manager-item[data-id="${draggedPhotoId}"]`);
			if (!source || source === item) return;
			const items = [...group.querySelectorAll(".photo-manager-item")];
			if (items.indexOf(source) < items.indexOf(item)) group.insertBefore(source, item.nextSibling);
			else group.insertBefore(source, item);
			const ids = [...group.querySelectorAll(".photo-manager-item")].map((photo) => photo.dataset.id);
			pendingPhotoOrders.set(group.dataset.category, ids);
			adminStatus.textContent = "Orden cambiado. Guarda el orden para aplicarlo a la galería.";
		});
	});
}

async function saveCategoryOrder() {
	if (!pendingCategoryOrder) return;
	if (!categoryOrderingAvailable) {
		adminStatus.textContent = "Ejecuta primero el archivo supabase-setup.sql actualizado en Supabase.";
		return;
	}
	const button = photoManager.querySelector(".save-category-order");
	button.disabled = true;
	const { error } = await supabaseClient.rpc("reorder_categories", {
		p_category_keys: pendingCategoryOrder
	});
	button.disabled = false;
	if (error) {
		adminStatus.textContent = `No se pudo guardar el orden de temáticas: ${error.message}`;
		return;
	}
	pendingCategoryOrder = null;
	adminStatus.textContent = "Orden de temáticas guardado.";
	await loadCloudPhotos();
	renderCategory(currentCategory);
}

function orderedPhotosForCategory(category, photos) {
	const order = pendingPhotoOrders.get(category);
	if (!order) return photos;
	const photosById = new Map(photos.map((photo) => [String(photo.id), photo]));
	return [...order.map((id) => photosById.get(String(id))).filter(Boolean), ...photos.filter((photo) => !order.includes(String(photo.id)))];
}

async function savePhotoOrder(button) {
	const category = button.dataset.category;
	const photoIds = pendingPhotoOrders.get(category);
	if (!photoIds) return;
	if (!photoOrderingAvailable) {
		adminStatus.textContent = "Ejecuta primero el archivo supabase-setup.sql actualizado en Supabase.";
		return;
	}
	button.disabled = true;
	const { error } = await supabaseClient.rpc("reorder_photos", {
		p_category: category,
		p_photo_ids: photoIds.map(Number)
	});
	button.disabled = false;
	if (error) {
		adminStatus.textContent = `No se pudo guardar el orden: ${error.message}`;
		return;
	}
	pendingPhotoOrders.delete(category);
	adminStatus.textContent = "Orden de fotos guardado.";
	await loadCloudPhotos();
	renderCategory(currentCategory);
}

function instagramUrl(value) {
	const cleanValue = value.trim();
	if (!cleanValue) return "";
	if (cleanValue.startsWith("@")) return `https://www.instagram.com/${cleanValue.slice(1)}/`;
	if (/^instagram\.com\//i.test(cleanValue)) return `https://www.${cleanValue}`;
	if (/^https?:\/\//i.test(cleanValue)) {
		try {
			const url = new URL(cleanValue);
			if (url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com")) return url.href;
		} catch {
			return "";
		}
		return "";
	}
	return `https://www.instagram.com/${cleanValue}/`;
}

function instagramHandle(value) {
	try {
		const pathPart = new URL(value).pathname.split("/").filter(Boolean)[0];
		return pathPart ? `@${decodeURIComponent(pathPart)}` : "Instagram";
	} catch {
		return "Instagram";
	}
}

async function savePhotoDetails(button) {
	const fields = button.closest(".photo-manager-fields");
	const displayName = fields.querySelector(".photo-name-input").value.trim();
	const cameraModel = fields.querySelector(".camera-model-input").value.trim();
	const instagram = instagramUrl(fields.querySelector(".instagram-input").value);
	const updates = { display_name: displayName || "Foto", instagram_url: instagram || null };
	if (cameraMetadataAvailable) updates.camera_model = cameraModel || null;
	const { error } = await supabaseClient.from("photos").update(updates).eq("id", button.dataset.id);
	adminStatus.textContent = error ? error.message : "Cambios guardados.";
	if (!error) {
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
}

async function saveAllAdminChanges() {
	const saveButton = document.querySelector("#save-all-changes");
	const jobs = [];
	const photosById = new Map(cloudPhotos.map((photo) => [String(photo.id), photo]));
	const photoManagerGroup = photoManager.querySelector(".photo-manager-group");
	const categoryNameInput = photoManagerGroup?.querySelector(".category-name-input");
	if (categoryNameInput) {
		const category = categoryNameInput.dataset.category;
		const name = categoryNameInput.value.trim();
		if (name !== (categories[category]?.name || "")) {
			jobs.push({
				label: `Nombre de temática "${category}"`,
				run: () => supabaseClient.from("photos").update({ category_name: name }).eq("category", category)
			});
		}
	}

	photoManager.querySelectorAll(".photo-manager-item").forEach((item) => {
		const photo = photosById.get(item.dataset.id);
		if (!photo) return;
		const displayName = item.querySelector(".photo-name-input").value.trim() || "Foto";
		const cameraModel = item.querySelector(".camera-model-input").value.trim();
		const instagram = instagramUrl(item.querySelector(".instagram-input").value);
		const updates = {};
		if (displayName !== (photo.display_name || photo.file_name)) updates.display_name = displayName;
		if (cameraMetadataAvailable && cameraModel !== (photo.camera_model || "")) updates.camera_model = cameraModel || null;
		if (instagram !== (photo.instagram_url || "")) updates.instagram_url = instagram || null;
		if (Object.keys(updates).length) {
			jobs.push({
				label: `Cambios de la foto "${photo.display_name || photo.file_name}"`,
				run: () => supabaseClient.from("photos").update(updates).eq("id", photo.id)
			});
		}
	});

	if (pendingCategoryOrder) {
		jobs.push({
			label: "Orden de temáticas",
			run: () => supabaseClient.rpc("reorder_categories", { p_category_keys: pendingCategoryOrder })
		});
	}
	pendingPhotoOrders.forEach((photoIds, category) => {
		jobs.push({
			label: `Orden de fotos de "${categories[category]?.name || category}"`,
			run: () => supabaseClient.rpc("reorder_photos", {
				p_category: category,
				p_photo_ids: photoIds.map(Number)
			})
		});
	});

	if (!jobs.length) {
		adminStatus.textContent = "No hay cambios pendientes por guardar.";
		return;
	}

	saveButton.disabled = true;
	adminStatus.textContent = "Guardando todos los cambios...";
	const results = await Promise.all(jobs.map(async (job) => {
		try {
			const { error } = await job.run();
			return { label: job.label, error: error?.message || null };
		} catch (error) {
			return { label: job.label, error: error instanceof Error ? error.message : String(error) };
		}
	}));
	saveButton.disabled = false;
	const failures = results.filter((result) => result.error);
	if (failures.length) {
		adminStatus.textContent = `No se pudieron guardar todos los cambios: ${failures.map((result) => `${result.label}: ${result.error}`).join("; ")}`;
		return;
	}

	pendingCategoryOrder = null;
	pendingPhotoOrders.clear();
	await loadCloudPhotos();
	renderCategory(currentCategory);
	adminStatus.textContent = "Todos los cambios se guardaron correctamente.";
}

async function deletePhoto(button) {
	if (!window.confirm("¿Borrar esta foto definitivamente?")) return;
	const { error: storageError } = await supabaseClient.storage.from("gallery").remove([button.dataset.path]);
	if (storageError) {
		adminStatus.textContent = storageError.message;
		return;
	}
	const { error } = await supabaseClient.from("photos").delete().eq("id", button.dataset.id);
	adminStatus.textContent = error ? error.message : "Foto borrada.";
	if (!error) {
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
}

async function deleteCategory(button) {
	const category = button.dataset.category;
	const categoryName = categories[category]?.name || category;
	if (!window.confirm(`¿Borrar toda la temática "${categoryName}" y sus fotos?`)) return;
	const photos = cloudPhotos.filter((photo) => photo.category === category);
	const { error: storageError } = await supabaseClient.storage.from("gallery").remove(photos.map((photo) => photo.storage_path));
	if (storageError) {
		adminStatus.textContent = storageError.message;
		return;
	}
	const { error } = await supabaseClient.from("photos").delete().eq("category", category);
	adminStatus.textContent = error ? error.message : `Temática "${categoryName}" borrada.`;
	if (!error) {
		await loadCloudPhotos();
		const categoryButton = document.querySelector(`.category-button[data-category="${category}"]`);
		categoryButton?.remove();
		["#upload-category", "#edit-category"].forEach((selector) => {
			[...document.querySelector(selector).options].find((option) => option.value === category)?.remove();
		});
		if (currentCategory === category) renderCategory("freestyle");
	}
}

function showPhoto(index, animate = true) {
	const totalPhotos = categories[currentCategory].photos.length;
	if (!totalPhotos) return;
	photoCards[currentPhoto]?.classList.remove("is-current");
	currentPhoto = (index + totalPhotos) % totalPhotos;
	galleryTrack.style.transition = animate ? "transform 0.65s cubic-bezier(.22,.68,0,1)" : "none";
	galleryTrack.style.transform = `translateX(-${currentPhoto * 100}%)`;
	photoCards[currentPhoto]?.classList.add("is-current");
	if (!animate) requestAnimationFrame(() => { galleryTrack.style.transition = "transform 0.65s cubic-bezier(.22,.68,0,1)"; });
	renderCollectionTools();
}

function updateCategoryBackground() {
	const category = categories[currentCategory];
	if (!category?.photos.length) return;
	currentBackgroundPhoto %= category.photos.length;
	const fileName = category.photos[currentBackgroundPhoto];
	const imageUrl = new URL(
		category.cloudUrls?.[fileName] || `fotos/${category.folder}/${fileName}`,
		document.baseURI
	).href;
	const incomingImage = new Image();
	incomingImage.src = imageUrl;
	const previousLayer = backgroundLayers[activeBackgroundLayer];
	const nextLayerIndex = (activeBackgroundLayer + 1) % backgroundLayers.length;
	const nextLayer = backgroundLayers[nextLayerIndex];
	nextLayer.style.backgroundImage = `url("${imageUrl}")`;
	void nextLayer.offsetWidth;
	nextLayer.classList.add("active");
	previousLayer.classList.remove("active");
	activeBackgroundLayer = nextLayerIndex;

	applyPhotoPalette(imageUrl);
}

function renderCollectionTools() {
	const category = categories[currentCategory];
	const fileName = category.photos[currentPhoto];
	if (!fileName) {
		collectionTools.innerHTML = "";
		return;
	}
	const photoId = category.cloudIds?.[fileName];
	const localKey = `liked-local-${currentCategory}-${fileName}`;
	const likeCount = category.likes?.[fileName] || (localStorage.getItem(localKey) ? 1 : 0);
	const liked = photoId ? localStorage.getItem(`liked-photo-${photoId}`) : localStorage.getItem(localKey);
	const instagram = category.instagram?.[fileName];
	const instagramName = instagram ? instagramHandle(instagram) : "Instagram";
	const cameraModel = category.cameraModels?.[fileName] || "Cámara no disponible";
	collectionTools.innerHTML = `<strong class="collection-tool-name" title="${escapeHtml(cameraModel)}"><span class="camera-mark" aria-hidden="true"></span>${escapeHtml(cameraModel)}</strong>
		${instagram ? `<a class="collection-tool-instagram" href="${escapeHtml(instagram)}" title="${escapeHtml(instagramName)}" target="_blank" rel="noopener noreferrer"><span class="instagram-mark" aria-hidden="true"></span> ${escapeHtml(instagramName)} ↗</a>` : `<span class="collection-tool-instagram instagram-empty"><span class="instagram-mark" aria-hidden="true"></span> Instagram</span>`}
		<button class="collection-tool-like like-button${liked ? " liked" : ""}" type="button" data-id="${photoId || ""}" data-local-key="${localKey}" aria-label="Me gusta"><span class="heart-icon" aria-hidden="true">♡</span><span class="like-count">${likeCount}</span></button>`;
	collectionTools.querySelector(".collection-tool-like").addEventListener("click", (event) => likePhoto(event.currentTarget));
}

async function likePhoto(button) {
	const photoId = button.dataset.id;
	const likedKey = button.dataset.localKey || `liked-photo-${photoId}`;
	if (localStorage.getItem(likedKey)) return;
	if (!photoId) {
		localStorage.setItem(likedKey, "true");
		button.classList.add("liked");
		button.querySelector(".like-count").textContent = Number(button.querySelector(".like-count").textContent) + 1;
		return;
	}
	button.disabled = true;
	const { error } = await supabaseClient.rpc("increment_photo_like", { photo_id: Number(photoId) });
	if (error) {
		button.disabled = false;
		return;
	}
	localStorage.setItem(likedKey, "true");
	button.classList.add("liked");
	button.querySelector(".like-count").textContent = Number(button.querySelector(".like-count").textContent) + 1;
	const photo = cloudPhotos.find((item) => String(item.id) === String(photoId));
	if (photo) photo.likes_count = Number(photo.likes_count || 0) + 1;
	Object.values(categories).forEach((category) => {
		const fileName = category.photos.find((name) => String(category.cloudIds?.[name]) === String(photoId));
		if (fileName) category.likes[fileName] = Number(category.likes?.[fileName] || 0) + 1;
	});
	refreshMostLikedCategory();
}

previousButton.addEventListener("click", () => showPhoto(currentPhoto - 1));
nextButton.addEventListener("click", () => showPhoto(currentPhoto + 1));

galleryTrack.addEventListener("click", (event) => {
	const image = event.target instanceof Element ? event.target.closest(".photo-placeholder") : null;
	if (!image) return;
	const index = photoCards.findIndex((card) => card.contains(image));
	if (index >= 0) openLightbox(index);
});

async function renderCategory(categoryKey) {
	const category = categories[categoryKey];
	if (!category) return;
	const renderVersion = ++categoryRenderVersion;
	currentCategory = categoryKey;
	currentBackgroundPhoto = 0;
	categoryTitle.textContent = category.name;
	categoryTitle.classList.remove("title-enter");
	void categoryTitle.offsetWidth;
	categoryTitle.classList.add("title-enter");
	if (!category.photos.length) {
		photoPaletteRequest += 1;
		backgroundLayers.forEach((layer) => {
			layer.classList.remove("active");
			layer.style.backgroundImage = "";
		});
		activeBackgroundLayer = 0;
		document.documentElement.style.removeProperty("--photo-accent");
		document.documentElement.style.removeProperty("--photo-accent-soft");
	} else {
		updateCategoryBackground();
	}
	document.querySelectorAll(".category-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.category === categoryKey);
	});

	const imagePath = (fileName) => category.cloudUrls?.[fileName] || `fotos/${category.folder}/${fileName}`;
	heroGroups = [[]];
	currentHeroSlide = 0;
	heroTrack.innerHTML = "";
	galleryTrack.innerHTML = category.photos.length ? category.photos.map((fileName, index) => {
		return `<article class="photo-card">
			<img class="photo-placeholder" src="${escapeHtml(imagePath(fileName))}" alt="Foto de ${escapeHtml(category.name)} ${index + 1}">
			<div class="caption"><span>${String(index + 1).padStart(2, "0")}</span></div>
		</article>`;
	}).join("") : `<p class="empty-category">${categoryKey === MOST_LIKED_CATEGORY_KEY ? "Todavía no hay fotos con likes." : "Todavía no hay fotos en esta temática."}</p>`;
	photoCards = [...galleryTrack.querySelectorAll(".photo-card")];
	currentPhoto = 0;
	showPhoto(0);
	const nextHeroGroups = category.photos.length
		? await createHeroGroups(categoryKey, imagePath)
		: [[]];
	if (renderVersion !== categoryRenderVersion || currentCategory !== categoryKey) return;
	heroGroups = nextHeroGroups;
	const renderGroup = (group) => `<div class="hero-slide-group" data-count="${group.length}">${group.map((fileName, index) =>
		`<div class="hero-slide-frame"><img class="hero-slide" src="${escapeHtml(imagePath(fileName))}" alt="Foto de ${escapeHtml(category.name)} ${index + 1}"></div>`
	).join("")}</div>`;
	heroTrack.innerHTML = heroGroups.map(renderGroup).join("") + renderGroup(heroGroups[0]);
	currentHeroSlide = 0;
	moveHeroCarousel(false);
}

function openLightbox(index) {
	const category = categories[currentCategory];
	if (!category.photos.length) return;
	lightboxIndex = (index + category.photos.length) % category.photos.length;
	const fileName = category.photos[lightboxIndex];
	lightboxImage.src = category.cloudUrls?.[fileName] || `fotos/${category.folder}/${fileName}`;
	lightboxImage.alt = category.displayNames?.[fileName] || fileName;
	lightboxCaption.textContent = category.displayNames?.[fileName] || fileName;
	lightbox.classList.add("open");
	lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
	lightbox.classList.remove("open");
	lightbox.setAttribute("aria-hidden", "true");
}

function moveLightbox(step) {
	openLightbox(lightboxIndex + step);
}

document.querySelector("#lightbox-close").addEventListener("click", closeLightbox);
document.querySelector("#lightbox-previous").addEventListener("click", () => moveLightbox(-1));
document.querySelector("#lightbox-next").addEventListener("click", () => moveLightbox(1));
lightbox.addEventListener("click", (event) => {
	if (event.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (event) => {
	if (!lightbox.classList.contains("open")) return;
	if (event.key === "Escape") closeLightbox();
	if (event.key === "ArrowLeft") moveLightbox(-1);
	if (event.key === "ArrowRight") moveLightbox(1);
});

async function createHeroGroups(categoryKey, imagePath) {
	const photos = categories[categoryKey].photos;
	const portraitPhotos = [];
	const slides = [];
	const dimensions = await Promise.all(photos.map((fileName) => {
		const src = imagePath(fileName);
		if (!imageDimensionsCache.has(src)) {
			imageDimensionsCache.set(src, new Promise((resolve) => {
				const image = new Image();
				image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
				image.onerror = () => {
					console.error(`No se pudieron obtener las dimensiones de la imagen: ${src}`);
					resolve(null);
				};
				image.src = src;
			}));
		}
		return imageDimensionsCache.get(src);
	}));
	photos.forEach((fileName, index) => {
		const size = dimensions[index];
		if (size && size.width >= size.height) {
			slides.push({ photos: [fileName], firstIndex: index });
			return;
		}
		portraitPhotos.push({ fileName, index });
	});

	const groupCount = heroPortraitLimit === 2 && portraitPhotos.length > 2 && portraitPhotos.length % 2 === 1
		? Math.floor(portraitPhotos.length / 2)
		: Math.ceil(portraitPhotos.length / heroPortraitLimit);
	if (groupCount) {
		const baseGroupSize = Math.floor(portraitPhotos.length / groupCount);
		const largerGroupCount = portraitPhotos.length % groupCount;
		let photoIndex = 0;
		for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
			const groupSize = baseGroupSize + (groupIndex < largerGroupCount ? 1 : 0);
			const group = portraitPhotos.slice(photoIndex, photoIndex + groupSize);
			slides.push({
				photos: group.map((photo) => photo.fileName),
				firstIndex: group[0].index
			});
			photoIndex += groupSize;
		}
	}
	return slides.sort((a, b) => a.firstIndex - b.firstIndex).map((slide) => slide.photos);
}

function moveHeroCarousel(withAnimation = true) {
	heroTrack.style.transition = withAnimation ? "transform 0.8s ease" : "none";
	heroTrack.style.transform = `translateX(-${currentHeroSlide * 100}%)`;
}

function waitForImageLoad(image) {
	if (image.complete) {
		return image.naturalWidth > 0
			? Promise.resolve()
			: Promise.reject(new Error(`No se pudo cargar la imagen inicial: ${image.currentSrc || image.src}`));
	}
	return new Promise((resolve, reject) => {
		image.addEventListener("load", resolve, { once: true });
		image.addEventListener("error", () => {
			reject(new Error(`No se pudo cargar la imagen inicial: ${image.currentSrc || image.src}`));
		}, { once: true });
	});
}

async function bootGallery() {
	initialLoader.hidden = false;
	initialLoader.classList.remove("has-error");
	initialLoaderRetry.classList.add("hidden");
	initialLoaderMessage.textContent = "";
	document.body.setAttribute("aria-busy", "true");
	try {
		await loadCloudPhotos();
		const firstCategory = document.querySelector(".category-nav .category-button")?.dataset.category || "freestyle";
		await renderCategory(firstCategory);
		const firstHeroGroup = heroTrack.querySelector(".hero-slide-group");
		const initialImages = [
			galleryTrack.querySelector(".photo-card.is-current .photo-placeholder"),
			...(firstHeroGroup?.querySelectorAll(".hero-slide") || [])
		].filter(Boolean);
		await Promise.all(initialImages.map(waitForImageLoad));
		initialLoader.hidden = true;
		document.body.removeAttribute("aria-busy");
	} catch (error) {
		console.error("No se pudo iniciar la galería.", error);
		initialLoader.classList.add("has-error");
		initialLoaderMessage.textContent = "No se pudo cargar la galería. Comprueba tu conexión e inténtalo de nuevo.";
		initialLoaderRetry.classList.remove("hidden");
		document.body.removeAttribute("aria-busy");
	}
}

initialLoaderRetry.addEventListener("click", bootGallery);

categoryButtons.forEach((button) => {
	button.addEventListener("click", () => {
		renderCategory(button.dataset.category);
	});
});

document.querySelector("#admin-toggle").addEventListener("click", () => {
	adminPanel.classList.add("open");
	adminPanel.setAttribute("aria-hidden", "false");
});

document.querySelector("#admin-close").addEventListener("click", () => {
	adminPanel.classList.remove("open");
	adminPanel.setAttribute("aria-hidden", "true");
});

loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!supabaseClient) return;
	adminStatus.textContent = "Iniciando sesión...";
	const { error } = await supabaseClient.auth.signInWithPassword({
		email: document.querySelector("#login-email").value,
		password: document.querySelector("#login-password").value
	});
	if (error) {
		adminStatus.textContent = error.message;
		return;
	}
	const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc("is_gallery_admin");
	if (adminCheckError || !isAdmin) {
		const { error: signOutError } = await supabaseClient.auth.signOut();
		if (adminCheckError) {
			adminStatus.textContent = `No se pudieron verificar los permisos de administrador: ${adminCheckError.message}${signOutError ? ` No se pudo cerrar la sesión: ${signOutError.message}` : ""}`;
		} else {
			adminStatus.textContent = `Esta cuenta no está autorizada para administrar la galería.${signOutError ? ` No se pudo cerrar la sesión: ${signOutError.message}` : ""}`;
		}
		return;
	}
	loginForm.classList.add("hidden");
	adminDashboard.classList.remove("hidden");
	uploadForm.classList.remove("hidden");
	editForm.classList.remove("hidden");
	adminStatus.textContent = "Sesión iniciada.";
	await loadAdminStatistics();
});

statisticsRefresh.addEventListener("click", loadAdminStatistics);
document.querySelector("#save-all-changes").addEventListener("click", saveAllAdminChanges);

editCategorySelect.addEventListener("change", renderPhotoManager);
editForm.addEventListener("submit", (event) => event.preventDefault());

uploadForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const files = [...document.querySelector("#upload-files").files];
	const newCategoryName = document.querySelector("#new-category-name").value.trim();
	const categoryName = newCategoryName || document.querySelector("#upload-category").selectedOptions[0].textContent;
	const category = newCategoryName ? categoryKeyFromName(newCategoryName) : document.querySelector("#upload-category").value;
	if (!supabaseClient || !files.length) return;
	if (!cameraMetadataAvailable) {
		adminStatus.textContent = "Ejecuta primero el archivo supabase-setup.sql actualizado para guardar el modelo de cámara.";
		return;
	}
	if (!category) {
		adminStatus.textContent = "Escribe un nombre válido para la temática.";
		return;
	}
	adminStatus.textContent = "Leyendo datos EXIF...";
	await Promise.all(files.map((file, index) => {
		let details = selectedFileDetails.get(index);
		if (!details) {
			details = {
				displayName: file.name,
				instagram: "",
				cameraModel: "",
				cameraExifStatus: "Leyendo EXIF..."
			};
			selectedFileDetails.set(index, details);
		}
		return readSelectedCameraModel(file, index, details);
	}));
	addCategoryToControls(category, categoryName);
	adminStatus.textContent = "Subiendo fotos...";

	try {
		const { data: existingPhotos, error: existingError } = await supabaseClient
			.from("photos")
			.select("file_name, sort_order, category_order")
			.eq("category", category);
		if (existingError) throw existingError;
		const existingNames = new Set((existingPhotos || []).map((photo) => photo.file_name.toLowerCase()));
		let nextSortOrder = Math.max(-1, ...(existingPhotos || []).map((photo) => Number(photo.sort_order ?? -1))) + 1;
		let categoryOrder = existingPhotos?.length ? Number(existingPhotos[0].category_order) : null;
		if (categoryOrder === null) {
			const { data: lastCategory, error: categoryOrderError } = await supabaseClient
				.from("photos")
				.select("category_order")
				.order("category_order", { ascending: false })
				.limit(1);
			if (categoryOrderError) throw categoryOrderError;
			categoryOrder = Number(lastCategory?.[0]?.category_order ?? -1) + 1;
		}
		const selectedNames = new Set();
		const duplicateNames = files.filter((file) => {
			const name = file.name.toLowerCase();
			if (existingNames.has(name) || selectedNames.has(name)) return true;
			selectedNames.add(name);
			return false;
		});
		if (duplicateNames.length) {
			adminStatus.textContent = `No se subieron duplicados: ${duplicateNames.map((file) => file.name).join(", ")}`;
			return;
		}
		for (const [index, file] of files.entries()) {
			const details = selectedFileDetails.get(index) || { displayName: file.name, cameraModel: "", instagram: "" };
			const displayName = details.displayName.trim() || file.name;
			const instagram = instagramUrl(details.instagram);
			const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
			const storagePath = `${category}/${Date.now()}-${safeName}`;
			const { error: uploadError } = await supabaseClient.storage.from("gallery").upload(storagePath, file, { upsert: false });
			if (uploadError) throw uploadError;
			const { error: insertError } = await supabaseClient.from("photos").insert({ category, category_name: categoryName, display_name: displayName, camera_model: details.cameraModel.trim() || null, instagram_url: instagram || null, file_name: file.name, storage_path: storagePath, sort_order: nextSortOrder, category_order: categoryOrder });
			if (insertError) throw insertError;
			existingNames.add(file.name.toLowerCase());
			nextSortOrder += 1;
		}
		editCategorySelect.value = category;
		await loadCloudPhotos();
		renderCategory(currentCategory);
		uploadForm.reset();
		selectedFileDetails.clear();
		selectedFilePage = 0;
		renderSelectedFiles();
		adminStatus.textContent = `${files.length} foto(s) subida(s).`;
	} catch (error) {
		adminStatus.textContent = error.message;
	}
});

document.querySelector("#logout-button").addEventListener("click", async () => {
	await supabaseClient?.auth.signOut();
	adminDashboard.classList.add("hidden");
	uploadForm.classList.add("hidden");
	editForm.classList.add("hidden");
	loginForm.classList.remove("hidden");
	adminStatus.textContent = "Sesión cerrada.";
});

setInterval(() => {
	if (!heroGroups.length) return;
	currentHeroSlide += 1;
	moveHeroCarousel();

	if (currentHeroSlide === heroGroups.length) {
		setTimeout(() => {
			currentHeroSlide = 0;
			moveHeroCarousel(false);
		}, 800);
	}
}, 3000);

setInterval(() => {
	const category = categories[currentCategory];
	if (!category || category.photos.length < 2) return;
	currentBackgroundPhoto = (currentBackgroundPhoto + 1) % category.photos.length;
	updateCategoryBackground();
}, 8000);

window.addEventListener("resize", () => {
	const nextPortraitLimit = window.matchMedia("(max-width: 700px)").matches ? 2 : 3;
	if (nextPortraitLimit !== heroPortraitLimit) {
		heroPortraitLimit = nextPortraitLimit;
		renderCategory(currentCategory);
		return;
	}
	moveHeroCarousel(false);
});
bootGallery();
