import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { getBaseUrl } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the correct path
dotenv.config({ path: path.resolve(__dirname, '.env') });

const ROLE_NAMES = {};
export { ROLE_NAMES };


const BASE_URL = getBaseUrl();

console.log('Base URL from sql.js:', BASE_URL);

// const BASE_URL = 'http://localhost/talenticks_webapp8.1';



// Add at the top with other constants
export let faqVectorsEmp = [];
export let faqVectorsMgr = [];
export let faqVectorsHr = [];

export async function loadAllFaqVectors() {
  try {
    faqVectorsEmp = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'data', 'faq_vectors_emp.json'), 'utf8'));
    faqVectorsMgr = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'data', 'faq_vectors_mgr.json'), 'utf8'));
    faqVectorsHr = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'data', 'faq_vectors_hr.json'), 'utf8'));
    console.log(`✅ Loaded FAQs - Emp:${faqVectorsEmp.length} Mgr:${faqVectorsMgr.length} HR:${faqVectorsHr.length}`);
  } catch (err) {
    console.error('❌ Error loading FAQ vectors:', err.message);
    // Initialize empty arrays if files don't exist
    faqVectorsEmp = [];
    faqVectorsMgr = [];
    faqVectorsHr = [];
  }
}

async function getConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
}

export async function getLeaveRoles() {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(`SELECT id, name FROM tt_leave_roles`);
    return rows;
  } catch (error) {
    console.error('Error fetching leave roles:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

export async function initializeRoleNames() {
  try {
    const roles = await getLeaveRoles();
    roles.forEach(role => {
      ROLE_NAMES[role.id] = role.name;
    });
    console.log('Role names initialized from database');
  } catch (error) {
    console.error('Failed to initialize role names:', error);
  }
}

export async function getSectionHierarchyString(roleIds = [2, 10, 7]) {
  console.log('🔍 Fetching section hierarchy for roles:', roleIds);
  const connection = await getConnection();

  try {
    const placeholders = roleIds.map(() => '?').join(',');
    console.log('📝 Executing query with placeholders:', placeholders);

    const [rows] = await connection.execute(
      `
      SELECT DISTINCT 
        m.id AS menu_id, 
        m.parent_menu, 
        m.name, 
        m.order_no, 
        mr.role_id
      FROM tt_menu AS m 
      JOIN tt_menu_role_mapping AS mr ON m.id = mr.menuid 
      WHERE mr.role_id IN (${placeholders})
      ORDER BY m.order_no;
    `, roleIds);

    console.log(`✅ Found ${rows.length} menu items`);

    await connection.end();

    const menuMap = new Map();
    const hierarchyMap = {};

    for (const row of rows) {
      const { menu_id, parent_menu, name, order_no, role_id } = row;

      if (!menuMap.has(menu_id)) {
        menuMap.set(menu_id, { menu_id, parent_menu, name, order_no, roles: new Set() });
      }
      menuMap.get(menu_id).roles.add(role_id);
    }

    const allowedIds = new Set([...menuMap.keys()]);

    for (const item of menuMap.values()) {
      const parentId = allowedIds.has(item.parent_menu) ? item.parent_menu : 'root';
      if (!hierarchyMap[parentId]) hierarchyMap[parentId] = [];
      hierarchyMap[parentId].push(item);
    }

    for (const key in hierarchyMap) {
      hierarchyMap[key].sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0));
    }

    function buildHierarchyText(parentId = 'root', depth = 0) {
      const items = hierarchyMap[parentId] || [];
      return items
        .map((item) => {
          const indent = '  '.repeat(depth);
          const roleLabels = [...item.roles].map(id => ROLE_NAMES[id]);
          const label = roleLabels.length > 0 ? ` (Only for: ${roleLabels.join(', ')})` : '';
          const childrenText = buildHierarchyText(item.menu_id, depth + 1);
          return `${indent}- ${item.name}${label}
${childrenText}`;
        })
        .join('');
    }

    const result = buildHierarchyText();
    console.log('✅ Section hierarchy built successfully');
    return result;
  } catch (error) {
    console.error('❌ Error in getSectionHierarchyString:', error);
    await connection.end();
    throw error;
  }
}

export async function getSectionIdByName(sectionName) {
  const connection = await getConnection();
  const [rows] = await connection.execute(
    `SELECT id FROM tt_menu WHERE name = ? LIMIT 1`,
    [sectionName]
  );
  await connection.end();

  return rows.length > 0 ? rows[0].id : null;
}

export async function roleHasAccessToSection(sectionId, roleIds = [2, 10, 7]) {
  const connection = await getConnection();
  const placeholders = roleIds.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT 1 FROM tt_menu_role_mapping WHERE menuid = ? AND role_id IN (${placeholders}) LIMIT 1`,
    [sectionId, ...roleIds]
  );
  await connection.end();

  return rows.length > 0;
}

export async function employee_validation(emp_code) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT firstname, emp_code, is_active FROM tt_empmst WHERE userid = ? LIMIT 1`,
      [emp_code]
    );
    if (rows.length === 0) {
      return { valid: false };
    }
    const { firstname, emp_code: code, is_active } = rows[0];
    return {
      valid: is_active === 1,
      is_active,
      firstname,
      emp_code: code
    };
  } catch (err) {
    console.error('❌ Error in employee_validation:', err);
    return { valid: false, error: err.message };
  } finally {
    await connection.end();
  }
}

// ✅ MySQL-compatible getSectionLink function
export async function getSectionLink(sectionName) {
  const connection = await getConnection();

  try {
    const normalized = sectionName.replace(/^[-\s]+/, '').trim().toLowerCase();

    const [rows] = await connection.execute(
      `SELECT id, name, link, parent_menu FROM tt_menu WHERE LOWER(name) = ? LIMIT 1`,
      [normalized]
    );

    if (rows.length === 0) {
      return `❌ The section "${sectionName}" does not exist.`;
    }

    const section = rows[0];

    if (section.link && section.link !== '#') {
      return `${BASE_URL}${section.link}`;
    }

    // Try to find child section with a valid link
    const [childRows] = await connection.execute(
      `SELECT link FROM tt_menu WHERE parent_menu = ? AND link IS NOT NULL AND link != '#' LIMIT 1`,
      [section.id]
    );

    if (childRows.length > 0) {
      return `${BASE_URL}${childRows[0].link}`;
    }

    return `⚠️ "${section.name}" and its subsections have no accessible links.`;

  } catch (error) {
    console.error('❌ Error in getSectionLink:', error);
    return `❌ An error occurred while retrieving the section link.`;
  } finally {
    await connection.end();
  }
}



// ✅ Alias for compatibility
//export const getSectionLink = getSectionLinkForRole;

// ✅ Get FAQs by roles
export async function getFAQsByRoles(roleIds) {
  const connection = await getConnection();
  try {
    const roleNames = roleIds.map(id => ROLE_NAMES[id]).filter(Boolean);
    console.log('Role names for FAQ fetch:', roleNames);

    const faqForSet = new Set();
    faqForSet.add(0); // Default for all employees

    if (roleNames.includes('HR')) {
      faqForSet.add(2);
    }
    if (roleNames.includes('Manager')) {
      faqForSet.add(1);
    }

    const faqForValues = Array.from(faqForSet);
    const placeholders = faqForValues.map(() => '?').join(',');
    const [rows] = await connection.execute(
      `SELECT question, answer FROM tt_faqs WHERE faq_for IN (${placeholders})`,
      faqForValues
    );

    return rows;
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

function getFaqVectorsForRoles(roleIds) {
  // Always include employee FAQ
  // See what it actually is
  let faqs = [...faqVectorsEmp];
  // Manager: 10 or 13
  if (roleIds.includes(10) || roleIds.includes(13)) {
    faqs = faqs.concat(faqVectorsMgr);
  }

  // HR: 7 or 15
  if (roleIds.includes(7) || roleIds.includes(15)) {
    faqs = faqs.concat(faqVectorsHr);
  }

  // Other roles: access to all
  const specialRoles = roleIds;
  if (!roleIds.every(id => specialRoles.includes(id))) {
    faqs = [...faqVectorsEmp, ...faqVectorsMgr, ...faqVectorsHr];
  }

  return faqs;
}

export { getFaqVectorsForRoles };
