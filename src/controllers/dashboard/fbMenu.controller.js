import FbMenuCategory from '../../models/FbMenuCategory.model.js';
import FbMenuSubcategory from '../../models/FbMenuSubcategory.model.js';
import FbDish from '../../models/FbDish.model.js';
import { uploadToR2 } from '../../utils/r2Upload.js';

// ==================== CATEGORIES ====================

export const getFbCategories = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    const categories = await FbMenuCategory.find(filter).sort({ name: 1 });
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    console.error('Get F&B categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve categories', error: error.message });
  }
};

export const createFbCategory = async (req, res) => {
  try {
    const category = await FbMenuCategory.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error('Create F&B category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category', error: error.message });
  }
};

export const updateFbCategory = async (req, res) => {
  try {
    const category = await FbMenuCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    console.error('Update F&B category error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category', error: error.message });
  }
};

export const deleteFbCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await FbMenuCategory.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const subcategories = await FbMenuSubcategory.find({ categoryId: id });
    const subcategoryIds = subcategories.map((s) => s._id);
    await FbDish.deleteMany({ subcategoryId: { $in: subcategoryIds } });
    await FbMenuSubcategory.deleteMany({ categoryId: id });
    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete F&B category error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category', error: error.message });
  }
};

export const uploadFbCategoryImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToR2(req.file.buffer, 'fb-menu/categories', req.file.mimetype);
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload F&B category image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};

// ==================== SUBCATEGORIES ====================

export const getFbSubcategories = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    const subcategories = await FbMenuSubcategory.find(filter).sort({ name: 1 });
    res.status(200).json({ success: true, count: subcategories.length, data: subcategories });
  } catch (error) {
    console.error('Get F&B subcategories error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve subcategories', error: error.message });
  }
};

export const createFbSubcategory = async (req, res) => {
  try {
    const subcategory = await FbMenuSubcategory.create(req.body);
    res.status(201).json({ success: true, data: subcategory });
  } catch (error) {
    console.error('Create F&B subcategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to create subcategory', error: error.message });
  }
};

export const updateFbSubcategory = async (req, res) => {
  try {
    const subcategory = await FbMenuSubcategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!subcategory) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.status(200).json({ success: true, data: subcategory });
  } catch (error) {
    console.error('Update F&B subcategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to update subcategory', error: error.message });
  }
};

export const deleteFbSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const subcategory = await FbMenuSubcategory.findByIdAndDelete(id);
    if (!subcategory) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    await FbDish.deleteMany({ subcategoryId: id });
    res.status(200).json({ success: true, message: 'Subcategory deleted successfully' });
  } catch (error) {
    console.error('Delete F&B subcategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete subcategory', error: error.message });
  }
};

// ==================== DISHES ====================

export const getFbDishes = async (req, res) => {
  try {
    const { subcategoryId } = req.query;
    const filter = {};
    if (subcategoryId) filter.subcategoryId = subcategoryId;
    const dishes = await FbDish.find(filter).sort({ name: 1 });
    res.status(200).json({ success: true, count: dishes.length, data: dishes });
  } catch (error) {
    console.error('Get F&B dishes error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve dishes', error: error.message });
  }
};

export const createFbDish = async (req, res) => {
  try {
    const dish = await FbDish.create(req.body);
    res.status(201).json({ success: true, data: dish });
  } catch (error) {
    console.error('Create F&B dish error:', error);
    res.status(500).json({ success: false, message: 'Failed to create dish', error: error.message });
  }
};

export const updateFbDish = async (req, res) => {
  try {
    const dish = await FbDish.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!dish) return res.status(404).json({ success: false, message: 'Dish not found' });
    res.status(200).json({ success: true, data: dish });
  } catch (error) {
    console.error('Update F&B dish error:', error);
    res.status(500).json({ success: false, message: 'Failed to update dish', error: error.message });
  }
};

export const deleteFbDish = async (req, res) => {
  try {
    const dish = await FbDish.findByIdAndDelete(req.params.id);
    if (!dish) return res.status(404).json({ success: false, message: 'Dish not found' });
    res.status(200).json({ success: true, message: 'Dish deleted successfully' });
  } catch (error) {
    console.error('Delete F&B dish error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete dish', error: error.message });
  }
};

export const uploadFbDishImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToR2(req.file.buffer, 'fb-menu/dishes', req.file.mimetype);
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload F&B dish image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};

const DIET_TYPES = ['Veg', 'Non-Veg', 'Vegan', 'Egg'];

/**
 * Bulk-import dishes from the dashboard's spreadsheet upload. Rows are keyed by the exact
 * columns the frontend's bulk-upload dialog produces. Resolves-or-creates the named
 * category/subcategory per row rather than requiring pre-existing IDs.
 */
export const bulkImportFbDishes = async (req, res) => {
  try {
    const { propertyId, rows } = req.body;
    if (!propertyId || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'propertyId and a non-empty rows array are required' });
    }

    const categories = await FbMenuCategory.find({ propertyId });
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const subcategories = await FbMenuSubcategory.find({ categoryId: { $in: categories.map((c) => c._id) } });
    const subcategoryByKey = new Map(subcategories.map((s) => [`${s.categoryId}:${s.name.toLowerCase()}`, s]));

    let created = 0;
    const dishesToInsert = [];

    for (const row of rows) {
      const categoryName = String(row.category ?? '').trim();
      const subcategoryName = String(row.subcategory ?? '').trim();
      const name = String(row.name ?? '').trim();
      const dietType = String(row.diet ?? '').trim();
      if (!categoryName || !subcategoryName || !name || !DIET_TYPES.includes(dietType)) continue;

      let category = categoryByName.get(categoryName.toLowerCase());
      if (!category) {
        category = await FbMenuCategory.create({ propertyId, name: categoryName });
        categoryByName.set(categoryName.toLowerCase(), category);
      }

      const subKey = `${category._id}:${subcategoryName.toLowerCase()}`;
      let subcategory = subcategoryByKey.get(subKey);
      if (!subcategory) {
        subcategory = await FbMenuSubcategory.create({ categoryId: category._id, name: subcategoryName });
        subcategoryByKey.set(subKey, subcategory);
      }

      dishesToInsert.push({
        subcategoryId: subcategory._id,
        name,
        description: row.desc ?? '',
        price: Number(row.price) || 0,
        dietType,
        gstPercent: Number(row.taxPercent) || 5,
        serves: String(row.serves ?? '1'),
        tags: Array.isArray(row.tags) ? row.tags : [],
        inStock: row.inStock !== false,
      });
      created++;
    }

    if (dishesToInsert.length > 0) await FbDish.insertMany(dishesToInsert);

    res.status(201).json({ success: true, count: created });
  } catch (error) {
    console.error('Bulk import F&B dishes error:', error);
    res.status(500).json({ success: false, message: 'Failed to import dishes', error: error.message });
  }
};
