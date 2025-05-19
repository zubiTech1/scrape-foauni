const fs = require('fs');
const axios = require('axios');

const API_URL = 'https://api.fouanistore.com/api/user/config/app/v1/all';

async function fetchCategories() {
    try {
        console.log('📄 Fetching categories...');

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

        const categoriesData = response?.data?.data?.categories;
        if (!Array.isArray(categoriesData)) {
            console.warn('⚠️ Categories data missing or not an array');
            return;
        }

        const transformedCategories = categoriesData.map(category => {
            const categoryId = category?.id;
            const categoryName = category?.name;

            if (!categoryId || !categoryName) {
                console.warn('⚠️ Skipping category with missing id or name:', category);
                return null;
            }

            const titleSlug = categoryName.toLowerCase().replace(/\s+/g, '-');

            const subcategories = Array.isArray(category.sub_categories)
                ? category.sub_categories
                    .filter(sub => sub?.id && sub?.name)
                    .map(sub => ({
                        title: sub.name,
                        link: `https://fouanistore.com/shop?category_id=${sub.id}&category_name=${sub.name.toLowerCase().replace(/\s+/g, '-')}`,
                        category_id: String(sub.id),
                        category_name: sub.name.toLowerCase().replace(/\s+/g, '-')
                    }))
                : [];

            subcategories.push({
                title: 'All',
                link: `https://fouanistore.com/shop?category_id=${categoryId}&category_name=${titleSlug}`,
                category_id: String(categoryId),
                category_name: titleSlug
            });

            // Construct image field if available
            let imageField = null;
            if (category.image?.base_url && category.image?.thumbnail && category.image?.origin) {
                imageField = {
                    base_url_thumbnail: `${category.image.base_url}/${category.image.thumbnail}`,
                    base_url_origin: `${category.image.base_url}/${category.image.origin}`
                };
            }

            return {
                title: titleSlug,
                subcategories,
                ...(imageField && { image: imageField })
            };
        }).filter(Boolean); // remove nulls

        // Save to menu_structure.json
        fs.writeFileSync(
            'menu_structure.json',
            JSON.stringify({ categories: transformedCategories }, null, 2)
        );

        console.log(`🎉 Done! Saved ${transformedCategories.length} categories to menu_structure.json`);

    } catch (error) {
        console.error('❌ Error fetching categories:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

fetchCategories();
