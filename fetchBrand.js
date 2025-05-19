const fs = require('fs');
const axios = require('axios');

const API_URL = 'https://api.fouanistore.com/api/user/config/app/v1/all';

function toSlug(text) {
    return text.toLowerCase().replace(/\s+/g, '-');
}

async function fetchBrands() {
    try {
        console.log('📦 Fetching brands...');

        const response = await axios.get(API_URL, {
            params: {
                sv_tenant: 'fouani',
                device_id: 'K1BcnsFV3KfO1HGQ3br9',
                sv_branch_id: 1
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://fouanistore.com/',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 30000
        });

        const brandsData = response?.data?.data?.brands;
        if (!Array.isArray(brandsData)) {
            console.warn('⚠️ Brands data missing or not an array');
            return;
        }

        const transformedBrands = brandsData
            .map(brand => {
                const brandId = brand?.id;
                const brandName = brand?.name;

                if (!brandId || !brandName) {
                    console.warn('⚠️ Skipping brand with missing id or name:', brand);
                    return null;
                }

                const titleSlug = toSlug(brandName);

                // Construct image if available
                let imageField = null;
                if (brand.image?.base_url && brand.image?.origin && brand.image?.thumbnail) {
                    imageField = {
                        base_url_origin: `${brand.image.base_url}/${brand.image.origin}`,
                        base_url_thumbnail: `${brand.image.base_url}/${brand.image.thumbnail}`
                    };
                }

                return {
                    title: titleSlug,
                    name: brandName,
                    product_counts: brand.product_counts || 0,
                    ...(imageField && { image: imageField })
                };
            })
            .filter(Boolean);

        fs.writeFileSync(
            'brand_structure.json',
            JSON.stringify({ brands: transformedBrands }, null, 2)
        );

        console.log(`🎉 Done! Saved ${transformedBrands.length} brands to brand_structure.json`);

    } catch (error) {
        console.error('❌ Error fetching brands:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

fetchBrands();
