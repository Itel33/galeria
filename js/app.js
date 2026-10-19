const galleryTrack = document.querySelector(".gallery-track");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const heroCarousel = document.querySelector(".hero-carousel");
const heroTrack = document.querySelector(".hero-track");
const categoryTitle = document.querySelector(".category-title");
const collectionTools = document.querySelector("#collection-tools");
const categoryButtons = document.querySelectorAll(".category-button");
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
let currentHeroSlide = 0;
let currentCategory = "freestyle";
let heroGroups = [];
let cloudPhotos = [];
let categoryRenderVersion = 0;
let photoOrderingAvailable = true;
let categoryOrderingAvailable = true;
let heroPortraitLimit = window.matchMedia("(max-width: 700px)").matches ? 2 : 3;
const imageDimensionsCache = new Map();
const pendingPhotoOrders = new Map();
let draggedPhotoId = null;
let pendingCategoryOrder = null;
let draggedCategoryKey = null;
const adminPanel = document.querySelector("#admin-panel");
const adminStatus = document.querySelector("#admin-status");
const loginForm = document.querySelector("#login-form");
const uploadForm = document.querySelector("#upload-form");
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

function categoryKeyFromName(name) {
	return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
		const details = selectedFileDetails.get(index) || { displayName: file.name, instagram: "" };
		selectedFileDetails.set(index, details);
		return `
		<div class="selected-file-row">
			<img src="${objectUrl}" alt="" loading="lazy" decoding="async">
			<div class="selected-file-fields">
				<strong>${escapeHtml(file.name)}</strong>
				<input data-file-index="${index}" class="selected-file-name" type="text" value="${escapeHtml(details.displayName)}" placeholder="Nombre de la foto">
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
	selectedFiles.querySelectorAll(".selected-file-name, .selected-file-instagram").forEach((input) => {
		input.addEventListener("input", () => {
			const index = Number(input.dataset.fileIndex);
			const details = selectedFileDetails.get(index);
			if (input.classList.contains("selected-file-name")) details.displayName = input.value;
			else details.instagram = input.value;
		});
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
	if (!categoryKey || categories[categoryKey]) return;
	categories[categoryKey] = { name: categoryName, folder: categoryKey, photos: [] };
	const categoryNav = document.querySelector(".category-nav");
	const categoryButton = document.createElement("button");
	categoryButton.className = "category-button";
	categoryButton.type = "button";
	categoryButton.dataset.category = categoryKey;
	categoryButton.textContent = categoryName;
	categoryButton.addEventListener("click", () => renderCategory(categoryKey));
	categoryNav.appendChild(categoryButton);
	const categoryOption = document.createElement("option");
	categoryOption.value = categoryKey;
	categoryOption.textContent = categoryName;
	document.querySelector("#upload-category").appendChild(categoryOption);
}

async function loadCloudPhotos() {
	if (!supabaseClient) return;

	let { data, error } = await supabaseClient
		.from("photos")
		.select("id, category, category_name, display_name, instagram_url, file_name, storage_path, likes_count, sort_order, category_order")
		.order("category_order", { ascending: true })
		.order("category", { ascending: true })
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });
	photoOrderingAvailable = !error;
	categoryOrderingAvailable = !error;
	if (error) {
		const fallback = await supabaseClient
			.from("photos")
			.select("id, category, category_name, display_name, instagram_url, file_name, storage_path, sort_order, category_order")
			.order("category_order", { ascending: true })
			.order("category", { ascending: true })
			.order("sort_order", { ascending: true })
			.order("created_at", { ascending: true });
		if (!fallback.error) {
			data = fallback.data;
			photoOrderingAvailable = true;
			categoryOrderingAvailable = true;
		} else {
			const photoOrderFallback = await supabaseClient
				.from("photos")
				.select("id, category, category_name, display_name, instagram_url, file_name, storage_path, sort_order")
				.order("category", { ascending: true })
				.order("sort_order", { ascending: true })
				.order("created_at", { ascending: true });
			if (!photoOrderFallback.error) {
				data = photoOrderFallback.data;
				photoOrderingAvailable = true;
				categoryOrderingAvailable = false;
			} else {
				const minimal = await supabaseClient
					.from("photos")
					.select("id, category, file_name, storage_path")
					.order("created_at", { ascending: true });
				data = minimal.data;
				photoOrderingAvailable = false;
				categoryOrderingAvailable = false;
			}
		}
	}
	if (!data) return;
	cloudPhotos = data;
	renderPhotoManager();
	if (!data.length) return;

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
		cloudCategories[photo.category].cloudIds = cloudCategories[photo.category].cloudIds || {};
		cloudCategories[photo.category].cloudIds[photo.file_name] = photo.id;
		cloudCategories[photo.category].likes = cloudCategories[photo.category].likes || {};
		cloudCategories[photo.category].likes[photo.file_name] = photo.likes_count || 0;
		cloudCategories[photo.category].instagram = cloudCategories[photo.category].instagram || {};
		cloudCategories[photo.category].instagram[photo.file_name] = photo.instagram_url || "";
	});
	categories = { ...categories, ...cloudCategories };
	applyCategoryOrder(orderedCategoryKeys);
}

function applyCategoryOrder(categoryKeys) {
	const categoryNav = document.querySelector(".category-nav");
	const uploadCategory = document.querySelector("#upload-category");
	const orderedButtons = categoryKeys.map((key) => categoryNav.querySelector(`.category-button[data-category="${CSS.escape(key)}"]`)).filter(Boolean);
	const remainingButtons = [...categoryNav.querySelectorAll(".category-button")].filter((button) => !categoryKeys.includes(button.dataset.category));
	[...orderedButtons, ...remainingButtons].forEach((button) => categoryNav.appendChild(button));

	const orderedOptions = categoryKeys.map((key) => [...uploadCategory.options].find((option) => option.value === key)).filter(Boolean);
	const remainingOptions = [...uploadCategory.options].filter((option) => !categoryKeys.includes(option.value));
	[...orderedOptions, ...remainingOptions].forEach((option) => uploadCategory.appendChild(option));
}

function escapeHtml(value) {
	return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function renderPhotoManager() {
	if (!cloudPhotos.length) {
		photoManager.innerHTML = "<h3>Aún no hay fotos en la nube</h3>";
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
	photoManager.innerHTML = `<h3>Editar fotos</h3>${photoOrderingAvailable ? "" : `<p class="photo-order-warning">Para habilitar el orden manual de las fotos, ejecuta el archivo supabase-setup.sql actualizado en el SQL Editor de Supabase.</p>`}${categoryOrderManager}${Object.entries(grouped).map(([category, group]) => `
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
						<small>${escapeHtml(photo.file_name)}</small>
						<input class="photo-name-input" aria-label="Nombre de la foto" value="${escapeHtml(photo.display_name || photo.file_name)}" data-id="${photo.id}">
						<input class="instagram-input" aria-label="Instagram del modelo" value="${escapeHtml(photo.instagram_url || "")}" placeholder="Instagram del modelo" data-id="${photo.id}">
						<button type="button" class="save-photo" data-id="${photo.id}">Guardar cambios</button>
					</div>
					<button type="button" class="delete-photo" data-id="${photo.id}" data-path="${escapeHtml(photo.storage_path)}">Borrar</button>
				</div>`;
			}).join("")}
		</div>`).join("")}`;
	photoManager.querySelectorAll(".photo-name-input").forEach((input) => input.addEventListener("change", () => updatePhotoName(input)));
	photoManager.querySelectorAll(".instagram-input").forEach((input) => input.addEventListener("change", () => updateInstagram(input)));
	photoManager.querySelectorAll(".save-photo").forEach((button) => button.addEventListener("click", () => savePhotoDetails(button)));
	photoManager.querySelectorAll(".category-name-input").forEach((input) => input.addEventListener("change", () => updateCategoryName(input)));
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

async function updatePhotoName(input) {
	const { error } = await supabaseClient.from("photos").update({ display_name: input.value.trim() }).eq("id", input.dataset.id);
	adminStatus.textContent = error ? error.message : "Nombre de foto actualizado.";
	if (!error) {
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
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

async function updateInstagram(input) {
	const { error } = await supabaseClient.from("photos").update({ instagram_url: instagramUrl(input.value) || null }).eq("id", input.dataset.id);
	adminStatus.textContent = error ? error.message : "Instagram actualizado.";
	if (!error) {
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
}

async function savePhotoDetails(button) {
	const fields = button.closest(".photo-manager-fields");
	const displayName = fields.querySelector(".photo-name-input").value.trim();
	const instagram = instagramUrl(fields.querySelector(".instagram-input").value);
	const { error } = await supabaseClient.from("photos").update({ display_name: displayName || "Foto", instagram_url: instagram || null }).eq("id", button.dataset.id);
	adminStatus.textContent = error ? error.message : "Cambios guardados.";
	if (!error) {
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
}

async function updateCategoryName(input) {
	const name = input.value.trim();
	const category = input.dataset.category;
	const { error } = await supabaseClient.from("photos").update({ category_name: name }).eq("category", category);
	adminStatus.textContent = error ? error.message : "Nombre de temática actualizado.";
	if (!error) {
		if (categories[category]) categories[category].name = name;
		document.querySelectorAll(`[data-category="${category}"]`).forEach((element) => {
			if (element.classList.contains("category-button") || element.tagName === "OPTION") element.textContent = name;
		});
		await loadCloudPhotos();
		renderCategory(currentCategory);
	}
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
		document.querySelector(`#upload-category option[value="${category}"]`)?.remove();
		if (currentCategory === category) renderCategory("freestyle");
	}
}

function showPhoto(index) {
	const totalPhotos = categories[currentCategory].photos.length;
	if (!totalPhotos) return;
	currentPhoto = (index + totalPhotos) % totalPhotos;
	galleryTrack.style.transform = `translateX(-${currentPhoto * 100}%)`;
	galleryTrack.style.transition = "transform 0.4s ease";
	renderCollectionTools();
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
	collectionTools.innerHTML = `<strong class="collection-tool-name"><span class="camera-mark" aria-hidden="true"></span>${escapeHtml(category.displayNames?.[fileName] || fileName)}</strong>
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
}

previousButton.addEventListener("click", () => showPhoto(currentPhoto - 1));
nextButton.addEventListener("click", () => showPhoto(currentPhoto + 1));

async function renderCategory(categoryKey) {
	const category = categories[categoryKey];
	if (!category) return;
	const renderVersion = ++categoryRenderVersion;
	currentCategory = categoryKey;
	if (category.photos.length) {
		const backgroundUrl = new URL(
			category.cloudUrls?.[category.photos[0]] || `fotos/${category.folder}/${category.photos[0]}`,
			document.baseURI
		).href;
		document.body.style.setProperty("--category-background", `url("${backgroundUrl}")`);
	}
	categoryTitle.textContent = category.name;
	document.querySelectorAll(".category-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.category === categoryKey);
	});

	const imagePath = (fileName) => category.cloudUrls?.[fileName] || `fotos/${category.folder}/${fileName}`;
	heroGroups = [[]];
	currentHeroSlide = 0;
	heroTrack.innerHTML = "";
	galleryTrack.innerHTML = category.photos.length ? category.photos.map((fileName, index) => {
		return `<article class="photo-card">
			<img class="photo-placeholder" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}">
			<div class="caption"><span>${String(index + 1).padStart(2, "0")}</span></div>
		</article>`;
	}).join("") : `<p class="empty-category">Todavía no hay fotos en esta temática.</p>`;
	galleryTrack.querySelectorAll(".photo-placeholder").forEach((image, index) => image.addEventListener("click", () => openLightbox(index)));
	currentPhoto = 0;
	showPhoto(0);
	const nextHeroGroups = category.photos.length
		? await createHeroGroups(categoryKey, imagePath)
		: [[]];
	if (renderVersion !== categoryRenderVersion || currentCategory !== categoryKey) return;
	heroGroups = nextHeroGroups;
	const renderGroup = (group) => `<div class="hero-slide-group" data-count="${group.length}">${group.map((fileName, index) =>
		`<div class="hero-slide-frame"><img class="hero-slide" src="${imagePath(fileName)}" alt="Foto de ${category.name} ${index + 1}"></div>`
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
	loginForm.classList.add("hidden");
	uploadForm.classList.remove("hidden");
	adminStatus.textContent = "Sesión iniciada.";
});

uploadForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const files = [...document.querySelector("#upload-files").files];
	const newCategoryName = document.querySelector("#new-category-name").value.trim();
	const categoryName = newCategoryName || document.querySelector("#upload-category").selectedOptions[0].textContent;
	const category = newCategoryName ? categoryKeyFromName(newCategoryName) : document.querySelector("#upload-category").value;
	if (!supabaseClient || !files.length) return;
	if (!category) {
		adminStatus.textContent = "Escribe un nombre válido para la temática.";
		return;
	}
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
			const details = selectedFileDetails.get(index) || { displayName: file.name, instagram: "" };
			const displayName = details.displayName.trim() || file.name;
			const instagram = instagramUrl(details.instagram);
			const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
			const storagePath = `${category}/${Date.now()}-${safeName}`;
			const { error: uploadError } = await supabaseClient.storage.from("gallery").upload(storagePath, file, { upsert: false });
			if (uploadError) throw uploadError;
			const { error: insertError } = await supabaseClient.from("photos").insert({ category, category_name: categoryName, display_name: displayName, instagram_url: instagram || null, file_name: file.name, storage_path: storagePath, sort_order: nextSortOrder, category_order: categoryOrder });
			if (insertError) throw insertError;
			existingNames.add(file.name.toLowerCase());
			nextSortOrder += 1;
		}
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
	uploadForm.classList.add("hidden");
	loginForm.classList.remove("hidden");
	adminStatus.textContent = "Sesión cerrada.";
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

window.addEventListener("resize", () => {
	const nextPortraitLimit = window.matchMedia("(max-width: 700px)").matches ? 2 : 3;
	if (nextPortraitLimit !== heroPortraitLimit) {
		heroPortraitLimit = nextPortraitLimit;
		renderCategory(currentCategory);
		return;
	}
	moveHeroCarousel(false);
});
loadCloudPhotos().finally(() => {
	const firstCategory = document.querySelector(".category-nav .category-button")?.dataset.category || "freestyle";
	renderCategory(firstCategory);
});
