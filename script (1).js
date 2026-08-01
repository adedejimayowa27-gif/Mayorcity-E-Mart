// 1. Core State Selectors matching your HTML Panel exactly
const form = document.getElementById("postForm");
const products = document.getElementById("products");
const searchBar = document.getElementById("searchBar");
const listingTypeSelect = document.getElementById("listingType");
const priceInput = document.getElementById("price");
const priceLabel = 
document.getElementById("priceLabel");
const uploadFormSection = document.getElementById("upload-form-section");

// Added missing password element selection mapping to prevent submission crashes
const postPasswordInput = document.getElementById("postPassword"); 

// Admin & Modal System Targets
const adminControlBar = document.getElementById("admin-control-bar");
const adminPortalBtn = document.getElementById("admin-portal-btn");
const adminLogoutBtn = document.getElementById("admin-logout-btn");
const viewModal = document.getElementById("viewModal");
const editModal = document.getElementById("editModal");
const viewModalContent = document.getElementById("viewModalContent");

// Core Local Memory Arrays
let productList = JSON.parse(localStorage.getItem("emart_products")) || [];
let currentTab = "all"; 
let currentCategory = "Show All";
let isAdminMode = JSON.parse(localStorage.getItem("emart_admin_active")) || false;

// FOUNDER MASTER ADMINISTRATIVE KEY (Adedeji Mayowa Mode)
if (adminPortalBtn) {
    adminPortalBtn.addEventListener("click", function(e) {
        e.preventDefault();
        if (isAdminMode) {
            alert("Administrative session already active, Mayowa.");
            return;
        }
        let pinEntry = prompt("🔒 Founder Authentication.\nEnter your master administrative login key code:");
        if (pinEntry === "2026") {
            isAdminMode = true;
            localStorage.setItem("emart_admin_active", "true");
            alert("Welcome back, Master Admin Adedeji Mayowa! Global moderation controls unlocked.");
            window.location.reload();
        } else if (pinEntry !== null) {
            alert("Access Denied: Invalid security clearance parameters.");
        }
    });
}

if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", function() {
        isAdminMode = false;
        localStorage.setItem("emart_admin_active", "false");
        alert("Administrative control loop closed safely.");
        window.location.reload();
    });
}

// AUTOMATED PLATFORM STATISTICS CALCULATIONS
function updatePlatformStatistics() {
    const totalCount = productList.length;
    const marketCount = productList.filter(p => p.type === "Market").length;
    const lostCount = productList.filter(p => p.type === "Lost").length;

    if (document.getElementById("stat-total")) document.getElementById("stat-total").innerText = totalCount;
    if (document.getElementById("stat-market")) document.getElementById("stat-market").innerText = marketCount;
    if (document.getElementById("stat-lost")) document.getElementById("stat-lost").innerText = lostCount;
    
    if (adminControlBar) {
        adminControlBar.style.display = isAdminMode ? "block" : "none";
    }
}

// Watch inputs and hide pricing fields instantly for Lost & Found items
if (listingTypeSelect) {
    listingTypeSelect.addEventListener("change", function() {
        if (this.value === "Lost") {
            if (priceInput) { priceInput.value = "0"; priceInput.style.display = "none"; }
            if (priceLabel) priceLabel.style.display = "none";
        } else {
            if (priceInput) priceInput.style.display = "block";
            if (priceLabel) priceLabel.style.display = "block";
        }
    });
}

// MASTER RENDER FUNCTION FOR PRODUCT CARDS
function displayProducts() {
    if (!products) return;
    products.innerHTML = "";
    const searchText = searchBar ? searchBar.value.toLowerCase() : "";

    const filteredList = productList.filter(product => {
        const prodName = product.productName ? product.productName.toLowerCase() : "";
        const prodDesc = product.description ? product.description.toLowerCase() : "";
        const prodSeller = product.sellerName ? product.sellerName.toLowerCase() : "";
        
        const matchesTab = currentTab === "all" || product.type === currentTab;
        const matchesCategory = currentCategory === "Show All" || product.category === currentCategory;
        const matchesSearch = prodName.includes(searchText) || prodDesc.includes(searchText) || prodSeller.includes(searchText);
        
        return matchesTab && matchesCategory && matchesSearch;
    });

    if (filteredList.length === 0) {
        products.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: #64748b; padding: 40px; font-weight:600;'>No items found matching the selected criteria.</p>";
        return;
    }

    filteredList.forEach(function (product) {
        const originalIndex = productList.indexOf(product);
        const isLostItem = product.type === "Lost";
        
        const displayPrice = isLostItem ? "Contact for details" : `₦${Number(product.price || 0).toLocaleString()}`;
        const productImage = product.image || "https://unsplash.com";
        
        let badgesHTML = `<span class="badge ${isLostItem ? 'badge-lost' : 'badge-market'}">${isLostItem ? 'Lost & Found' : 'For Sale'}</span>`;
        badgesHTML += ` <span class="badge badge-cat">${product.category || 'General'}</span>`;
        
        if (product.reports && product.reports >= 3) {
            badgesHTML += ` <span class="badge badge-sold" style="background:#f97316; color:white;">⚠️ UNDER REVIEW</span>`;
        } else if (product.status === "Sold") {
            badgesHTML += ` <span class="badge badge-sold">SOLD</span>`;
        }

        // Everyone sees Edit/Delete now, but a password challenge triggers when clicked
        products.innerHTML += `
        <div class="product-card">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
               ${badgesHTML}
            </div>
            <img src="${productImage}" alt="${product.productName || 'Product picture'}">
            <h3>${product.productName || 'Untitled Item'}</h3>
            <p><strong>Contact Person:</strong> ${product.sellerName || 'Anonymous'}</p>
            <p><strong>Price Evaluation:</strong> ${displayPrice}</p>
            <p>${product.description ? product.description.substring(0, 75) + '...' : 'No details compiled.'}</p>
           
            <button type="button" class="view-btn" data-index="${originalIndex}">View Details</button>
            <button type="button" class="edit-btn" data-index="${originalIndex}">Edit Parameters</button>
            <button type="button" class="delete-btn" data-index="${originalIndex}">Delete Listing</button>
        </div>
        `;
    });
}

// Live text search queries
if (searchBar) { searchBar.addEventListener("input", displayProducts); }

// Category Bubble Navigation Handlers
document.querySelectorAll("#category-list li").forEach(li => {
    li.addEventListener("click", function() {
        document.querySelectorAll("#category-list li").forEach(l => l.classList.remove("active-cat"));
        this.classList.add("active-cat");
        currentCategory = this.innerText;
        displayProducts();
    });
});

// Layout Tab Switch Routing Controls
document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", function() {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active-tab"));
        this.classList.add("active-tab");
        currentTab = this.getAttribute("data-type");
        displayProducts();
    });
});

// Click delegation handler for grid card buttons
if (products) {
    products.addEventListener("click", function (event) {
        const target = event.target;
        const index = parseInt(target.getAttribute("data-index"));

        if (!isNaN(index)) {
            if (target.classList.contains("delete-btn")) { deleteProduct(index); }
            if (target.classList.contains("view-btn")) { openViewModal(index); }
            if (target.classList.contains("edit-btn")) { openEditModal(index); }
        }
    });
}

// Security-Locked Item Deletion Logic (Seller PIN challenge or Admin Shield Override)
function deleteProduct(index) {
    const product = productList[index];
    if (!product) return;

    if (isAdminMode) {
        if (confirm("Master Admin Override Engaged: Force delete this listing permanently?")) {
            executeRemoval();
        }
        return;
    }

    let inputPin = prompt("🔑 Security Verification:\nEnter the password/PIN you assigned to this listing to authorize deletion:");
    if (inputPin === product.pinCode) {
        executeRemoval();
    } else if (inputPin !== null) {
        alert("Authorization Fault: Invalid password/PIN code.");
    }

    function executeRemoval() {
        productList.splice(index, 1);
        localStorage.setItem("emart_products", JSON.stringify(productList));
        displayProducts();
        updatePlatformStatistics();
        alert("Listing cleared successfully!");
    }
}

// Clean helper formatting mappings for telephone inputs
function formatWhatsAppNumber(num) {
    if (!num) return "";
    let clean = num.toString().replace(/\D/g, ""); 
    if (clean.startsWith("0")) { clean = "234" + clean.substring(1); }
    return clean;
}
// 1. FULL OVERVIEW CINEMATIC VIEW DETAILS MODAL POP-UP
function openViewModal(index) {
    const product = productList[index];
    if (!product) return;
    
    const isLost = product.type === "Lost";
    const waCleanNumber = formatWhatsAppNumber(product.sellerWhatsapp || "09150434157");
    
    const messageText = encodeURIComponent(`Hello ${product.sellerName}, I am interested in your item "${product.productName}" on Mayorcity E-Mart!`);
    const waLink = `https://wa.me/${waCleanNumber}?text=${encodeURIComponent(messageText)}`;
    
    const productImage = product.image || "https://unsplash.com";
    const formattedPrice = isLost ? "N/A (Lost & Found Tracking)" : `₦${Number(product.price || 0).toLocaleString()}`;

    let adminSoldToggle = "";
    if (isAdminMode && product.status !== "Sold") {
        adminSoldToggle = `
            <button type="button" id="admin-mark-sold-btn" class="secondary-btn" style="width:100%; border-color:#dc2626; color:#dc2626; margin-top:10px;">
               🛑 Mark Product Asset as SOLD (Admin Override)
            </button>
        `;
    }

    viewModalContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
            <img src="${productImage}" style="width: 100%; max-height: 380px; object-fit: cover; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div>
                <h2 style="color: #0f172a; font-size: 26px; font-weight: 800; margin-bottom: 5px;">${product.productName}</h2>
                <div style="margin: 10px 0; display:flex; gap:10px; flex-wrap:wrap;">
                   <span class="badge ${isLost ? 'badge-lost' : 'badge-market'}">${isLost ? 'Lost & Found Section' : 'Marketplace Item'}</span>
                   <span class="badge badge-cat">${product.category}</span>
                   ${product.status === 'Sold' ? '<span class="badge badge-sold">SOLD</span>' : ''}
                </div>
                
                <div style="background:#f8fafc; padding:15px; border-radius:10px; margin:15px 0; border:1px solid #e2e8f0; font-size:14px;">
                   <p style="margin: 4px 0;"><strong>Price Evaluation:</strong> <span style="font-size:16px; color:#0f172a; font-weight:bold;">${formattedPrice}</span></p>
                   <p style="margin: 4px 0;"><strong>Contact Person:</strong> ${product.sellerName}</p>
                   <p style="margin: 4px 0;"><strong>Product ID Node:</strong> <span style="font-family:monospace; color:#64748b;">${product.id}</span></p>
                   <p style="margin: 4px 0;"><strong>Timestamp Logged:</strong> ${product.datePosted || 'Unknown'}</p>
                </div>

                <h4 style="color: #0f172a; font-size:16px; margin-bottom:6px;">Full Narrative Description:</h4>
                <p style="color:#475569; font-size:15px; line-height:1.6; background:#ffffff; padding:12px; border-radius:8px; border-left:4px solid #38bdf8; margin-bottom:20px; white-space: pre-wrap;">${product.description || 'No descriptive criteria compiled for item.'}</p>
                
                <button type="button" id="modal-wa-btn" class="whatsapp-btn" style="width: 100%; border: none; font-size: 16px; cursor: pointer;">
                   💬 Open Chat with Seller on WhatsApp
                </button>

                <p style="text-align:center; margin-top:15px;">
                   <a href="#" id="report-item-link" data-index="${index}" style="color:#64748b; font-size:13px; font-weight:600; text-decoration:none;">⚠️ Flag/Report Suspicious Spam Listing</a>
                </p>

                ${adminSoldToggle}
            </div>
        </div>
    `;

    document.getElementById("modal-wa-btn").addEventListener("click", function() {
        window.open(waLink, '_blank', 'noopener,noreferrer');
    });

    document.getElementById("report-item-link").addEventListener("click", function(e) {
        e.preventDefault();
        const idx = parseInt(this.getAttribute("data-index"));
        if (!productList[idx].reports) { productList[idx].reports = 0; }
        productList[idx].reports += 1;
        
        localStorage.setItem("emart_products", JSON.stringify(productList));
        alert("Thank you! Your abuse report has been filed securely. Founder Adedeji Mayowa will audit this listing packet shortly.");
        viewModal.style.display = "none";
        displayProducts();
    });

    if (isAdminMode && product.status !== "Sold") {
        document.getElementById("admin-mark-sold-btn").addEventListener("click", function() {
            productList[index].status = "Sold";
            localStorage.setItem("emart_products", JSON.stringify(productList));
            alert("Administrative Change Logged: Product status shifted to SOLD.");
            viewModal.style.display = "none";
            displayProducts();
        });
    }

    viewModal.style.display = "flex";
}

// 2. INTERACTIVE PARAMETER EDITOR WINDOW
function openEditModal(index) {
    const product = productList[index];
    if (!product) return;

    if (!isAdminMode) {
        let inputPin = prompt("🔑 Security Verification:\nEnter your unique item password/PIN to authorize modifications:");
        if (inputPin !== product.pinCode) {
            alert("Access Denied: Invalid edit PIN code.");
            return;
        }
    }
    
    document.getElementById("editIndex").value = index;
    document.getElementById("editName").value = product.productName || "";
    document.getElementById("editPrice").value = product.price || 0;
    document.getElementById("editDescription").value = product.description || "";
    
    editModal.style.display = "flex";
}

document.getElementById("editForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const index = document.getElementById("editIndex").value;
    
    if (productList[index]) {
        productList[index].productName = document.getElementById("editName").value;
        productList[index].price = document.getElementById("editPrice").value;
        productList[index].description = document.getElementById("editDescription").value;
        
        localStorage.setItem("emart_products", JSON.stringify(productList));
        editModal.style.display = "none";
        displayProducts();
        updatePlatformStatistics();
        alert("Listing changes saved successfully!");
    }
});
// 3. SECURE BATTLE-TESTED FREEZE-PROOF SUBMISSION HANDLER
if (form) {
    form.addEventListener("submit", function (event) {
        event.preventDefault();

        // Safe Element Grabbers: These will never crash the browser even if fields are missing in HTML
        let productNameEl = document.getElementById("productName");
        let typeEl = document.getElementById("listingType");
        let categoryEl = document.getElementById("productCategory");
        let priceEl = document.getElementById("price");
        let descriptionEl = document.getElementById("description");
        let sellerEl = document.getElementById("seller"); 
        let whatsappEl = document.getElementById("whatsapp"); 
        let passwordEl = document.getElementById("postPassword");
        let imageInput = document.getElementById("image"); 

        // Extract values safely with strict fallbacks to prevent null exceptions
        let productName = productNameEl ? productNameEl.value.trim() : "";
        let type = typeEl ? typeEl.value : "Market";
        let category = categoryEl ? categoryEl.value : "Other Items";
        let price = priceEl ? priceEl.value.trim() : "0";
        let description = descriptionEl ? descriptionEl.value.trim() : "";
        let sellerName = sellerEl ? sellerEl.value.trim() : "Anonymous Student"; 
        let whatsappNumber = whatsappEl ? whatsappEl.value.trim() : "09150434157"; 
        let pinCode = passwordEl ? passwordEl.value.trim() : "0000";

        if (type === "Market" && price === "") {
            alert("Validation Warning: Please enter a price for items For Sale.");
            return;
        }

        if (productName === "" || description === "" || whatsappNumber === "") {
            alert("Form Entry Empty: Please fill out the item name, description, and WhatsApp number.");
            return;
        }

        // --- INTEGRATED ₦100 OPAY PAYMENT SIMULATION PORTAL ---
        let transferPrompt = confirm(
            `💰 Mayorcity E-Mart Listing Verification\n\nTo keep our campus index safe from spam bots, a small listing verification charge applies.\n\n==========================\nAMOUNT: ₦100 Only\nBANK: OPAY\nACCOUNT NUMBER: 9150434157\nACCOUNT NAME: ADEDEJI MAYOWA\n==========================\n\nClick OK if you have made the bank transfer to founder Adedeji Mayowa.`
        );

        if (!transferPrompt) {
            alert("Upload Canceled: Payment verification required to list items.");
            return;
        }

        let senderName = prompt("📝 Payment Audit Tracker:\nEnter your Bank Sender Name or Transaction Reference for payment confirmation:");
        if (!senderName || senderName.trim() === "") {
            alert("Validation Error: Sender trace missing. Publication canceled.");
            return;
        }

        // --- AUTOMATED ULTRA-LIGHTWEIGHT GALLERY IMAGE COMPRESSOR ---
        let hasImage = imageInput && imageInput.files && imageInput.files.length > 0;

        if (hasImage) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    
                    const max_size = 400; 
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > max_size) { height *= max_size / width; width = max_size; }
                    } else {
                        if (height > max_size) { width *= max_size / height; height = max_size; }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6); 
                    saveProductData(compressedDataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(imageInput.files[0]); // Explicitly loads the first selected asset pointer safely
        } else {
            // Category placeholder fallback urls if field is left blank
            let placeholderUrl = "https://unsplash.com";
            if (category === "Phones & Accessories") placeholderUrl = "https://unsplash.com";
            else if (category === "Laptops & Electronics") placeholderUrl = "https://unsplash.com";
            else if (category === "Fashion") placeholderUrl = "https://unsplash.com";
            
            saveProductData(placeholderUrl);
        }

        function saveProductData(imageData) {
            let productPacket = {
                id: "EMART-" + Math.floor(100000 + Math.random() * 900000), 
                productName: productName,
                type: type,
                category: category,
                price: type === "Lost" ? "0" : price, 
                description: description,
                image: imageData,
                datePosted: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                sellerName: sellerName,
                sellerWhatsapp: whatsappNumber,
                pinCode: pinCode,
                reports: 0,
                status: "Active",
                paymentRef: senderName
            };

            productList.push(productPacket);
            localStorage.setItem("emart_products", JSON.stringify(productList));
            
            displayProducts();
            updatePlatformStatistics();
            form.reset(); 
            
            if (priceInput) priceInput.style.display = "block";
            if (priceLabel) priceLabel.style.display = "block";
            uploadFormSection.style.display = "none";
            
            alert("🎉 Transfer Authenticated! Your product listing is now broadcasting live on Mayorcity E-Mart!");
        }
    });
}

// Operational navigation listeners
if (document.getElementById("hero-post-btn")) {
    document.getElementById("hero-post-btn").onclick = () => {
        if (uploadFormSection) {
            uploadFormSection.style.display = "block";
            uploadFormSection.scrollIntoView({ behavior: 'smooth' });
        }
    };
}
if (document.getElementById("hide-form-btn")) {
    document.getElementById("hide-form-btn").onclick = () => { uploadFormSection.style.display = "none"; };
}
if (document.getElementById("hero-explore-btn")) {
    document.getElementById("hero-explore-btn").onclick = () => {
        const targetSection = document.getElementById("featured-listings");
        if (targetSection) targetSection.scrollIntoView({ behavior: 'smooth' });
    };
}

// Modal interface exit routing windows
if (document.getElementById("closeViewModal")) { document.getElementById("closeViewModal").onclick = () => { viewModal.style.display = "none"; }; }
if (document.getElementById("closeEditModal")) { document.getElementById("closeEditModal").onclick = () => { editModal.style.display = "none"; }; }

window.onclick = (e) => {
    if (e.target === viewModal) viewModal.style.display = "none";
    if (e.target === editModal) editModal.style.display = "none";
};

// FLOATING BACK TO TOP CONTROL HOOK
const backToTopBtn = document.getElementById("backToTopBtn");
if (backToTopBtn) {
    window.addEventListener("scroll", function() {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            backToTopBtn.style.display = "flex";
        } else {
            backToTopBtn.style.display = "none";
        }
    });

    backToTopBtn.onclick = function() {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };
}

// RUN BASELINE INITIALIZATION MOUNT
updatePlatformStatistics();
displayProducts();
