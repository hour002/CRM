ALTER TABLE `customers` ADD `city` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `customers` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `customers` ADD `location_precision` text DEFAULT 'province' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customers_province_city` ON `customers` (`province`,`city`);--> statement-breakpoint
UPDATE customers SET city = CASE
  WHEN name LIKE '%南京%' THEN '南京市' WHEN name LIKE '%北京%' THEN '北京市' WHEN name LIKE '%南通%' THEN '南通市'
  WHEN name LIKE '%厦门%' THEN '厦门市' WHEN name LIKE '%广州%' THEN '广州市' WHEN name LIKE '%武汉%' THEN '武汉市'
  WHEN name LIKE '%深圳%' THEN '深圳市' WHEN name LIKE '%常州%' THEN '常州市' WHEN name LIKE '%东莞%' THEN '东莞市'
  WHEN name LIKE '%成都%' THEN '成都市' WHEN name LIKE '%青岛%' THEN '青岛市' WHEN name LIKE '%鄂州%' THEN '鄂州市'
  WHEN name LIKE '%苏州%' THEN '苏州市' WHEN name LIKE '%昆山%' THEN '昆山市' WHEN name LIKE '%杭州%' THEN '杭州市'
  ELSE city END WHERE city = '';--> statement-breakpoint
UPDATE customers SET province='上海市', city='上海市', address='上海市普陀区中山北路3185号', location_precision='city' WHERE name='中邮科技股份有限公司';--> statement-breakpoint
UPDATE customers SET province='北京市', city='北京市', address='北京市石景山区田顺庄北路1号院1号楼12层', location_precision='city' WHERE name='航旅纵横';--> statement-breakpoint
UPDATE customers SET city='广州市', address='广州市天河区思成路17号宏太智慧谷4栋一层', location_precision='city' WHERE name='广东康利达物联科技有限公司';--> statement-breakpoint
UPDATE customers SET city='清远市', location_precision='city' WHERE name='广东峰望智能科技有限公司';--> statement-breakpoint
UPDATE customers SET city='东莞市', address='广东省东莞市寮步镇横坑宝塘路59号之一901室', location_precision='city' WHERE name='广东启源创新科技有限公司';--> statement-breakpoint
UPDATE customers SET city='佛山市', address='广东省佛山市南海区狮山镇官窑永安大道9号', location_precision='city' WHERE name='广东泽业科技有限公司';--> statement-breakpoint
UPDATE customers SET city='湖州市', location_precision='city' WHERE name='浙江毛仕力智能装备有限公司';--> statement-breakpoint
UPDATE customers SET province='江苏省', city='南京市', address='南京市江北新区星火路15号', location_precision='city' WHERE name='东集技术股份有限公司';--> statement-breakpoint
UPDATE customers SET city='东莞市', address='广东省东莞市长安镇长安兴发南路66号之一', location_precision='city' WHERE name='广东奥普特科技股份有限公司';--> statement-breakpoint
UPDATE customers SET city='东莞市', address='广东省东莞市望牛墩镇洲湾村拓鑫工业园', location_precision='city' WHERE name='广东科达计量科技有限公司';--> statement-breakpoint
UPDATE customers SET city='南京市', location_precision='city' WHERE name='江苏泰博电子科技有限公司';--> statement-breakpoint
UPDATE customers SET province='湖北省', city='鄂州市', location_precision='city' WHERE name='先进物流装备(鄂州)有限公司';--> statement-breakpoint
UPDATE customers SET province='北京市', city='北京市', address='北京市海淀区邓庄南路9号', location_precision='city' WHERE name='中国科学院空天信息创新研究院';--> statement-breakpoint
UPDATE customers SET province='海外', city='Bangkok', address='34 Ramkhamhaeng 78, Huamark, Bangkapi, Bangkok 10240, Thailand', location_precision='city' WHERE name='SECURE SOLUTIONS ASIA CO., LTD.';--> statement-breakpoint
UPDATE customers SET location_precision='city' WHERE city <> '' AND location_precision='province';
