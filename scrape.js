const fs = require('fs'); // Add this at the top
const axios = require('axios');



const BUILD_ID = 'GO-3r8YXmGfG25XhVX0rj';
const BASE_LIST_URL = `https://fouanistore.com/_next/data/${BUILD_ID}/en/shop.json?page=`;
const PRODUCT_DETAIL_BASE_URL = `https://fouanistore.com/_next/data/${BUILD_ID}/en/product/`;


function cleanProductData(raw) {
    const data = raw?.pageProps?.data?.data;
    if (!data || !data.id) return null;



    return {
        uuid: data.uuid,
        url: `https://fouanistore.com/product/${data.id}?uuid=${data.uuid}`,
        stock_status: data.product_branchs?.[0]?.ribbon?.name || 'In Stock',
        title: data.name,
        manufacturer: data.brand_name || data.brand?.name || '',
        sku: data.product_branchs?.[0]?.sku || data.barcodes?.[0] || '',
        price: data.display_price,
        image: data.image
            ? {
                origin: `${data.image.base_url}/${data.image.origin}`,
                thumbnail: `${data.image.base_url}/${data.image.thumbnail}`
            }
            : null,
        images: Array.isArray(data.images)
            ? data.images.map(img => ({
                origin: img.origin ? `${img.base_url}/${img.origin}` : null,
                thumbnail: img.thumbnail ? `${img.base_url}/${img.thumbnail}` : null
            }))
            : [],
        attachments: Array.isArray(data.attachments)
            ? data.attachments.map(att => att.uuid)
            : [],

        description: data.description,
        searchtext: data.searchtext,
        specifications: data.attributes,
        video_url: data.video_url,
        nb_views: data.nb_views,
        created_at: data.created_at,
        files: data.files,
        last_synced_at: data.last_synced_at,
        product_categories: data.product_categories?.map(cat => ({
            category: cat.name,
            sub_categories: cat.sub_categories?.map(sub => sub.name)
        })),

        related: Array.isArray(data.related)
            ? data.related.map(r => ({
                uuid: r.uuid,
            }))
            : []
    };
}
// Fetch paginated list of products
async function fetchPage(page) {
    try {
        const response = await axios.get(BASE_LIST_URL + page);

        const products = response.data?.pageProps?.data?.data || [];
        return products.map(p => ({
            id: p.id,
            uuid: p.uuid,
        }));
    } catch (error) {
        console.log(error)
        // console.error(`❌ Error fetching page ${page}:`, error.message);
        return [];
    }
}


// Fetch full product detail
async function fetchProductDetail({ id, uuid }) {
    const url = `${PRODUCT_DETAIL_BASE_URL}${id}.json?uuid=${uuid}&id=${id}`;

    try {

        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://fouanistore.com/',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': `branch_id=1`
            }
        });
        return cleanProductData(response.data);
    } catch (error) {
        console.log(error);
        return null;
    }
}

// Master function to fetch everything
async function fetchAllProducts() {
    let page = 1;
    let allProducts = [];

    while (true) {
        console.log(`📄 Fetching page ${page}...`);
        const products = await fetchPage(page);

        if (!products.length) {
            console.log(`✅ No more products found after page ${page}.`);
            break;
        }

        allProducts = allProducts.concat(products);
        page++;
    }

    console.log(`📦 Total products to fetch: ${allProducts.length}`);

    const results = [];
    const concurrency = 10;

    for (let i = 0; i < allProducts.length; i += concurrency) {
        const chunk = allProducts.slice(i, i + concurrency);
        const fetched = await Promise.all(chunk.map(fetchProductDetail));
        results.push(...fetched.filter(Boolean));
        console.log(`✅ Fetched ${Math.min(i + concurrency, allProducts.length)} of ${allProducts.length}`);
    }
    fs.writeFileSync('products.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log(`🎉 Done! Saved ${results.length} products.json`);

}

fetchAllProducts();
