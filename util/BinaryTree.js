class Node {
	constructor(data, parent_data) {
        this.parent_data = parent_data
        this.data = data
        this.left = null
        this.right = null
	}
}

const insertLevelOrder = (arr, root, i, parent_data) => {
	if (i < arr.length) {
		let temp = new Node({
			address: arr[i],
			index: i
		}, parent_data)
		root = temp
		root.left = insertLevelOrder(arr, root.left, 2 * i + 1, root.data)
		root.right = insertLevelOrder(arr, root.right, 2 * i + 2, root.data)
	}
	return root
}


// level order tree traversal

const takeActionForCurrentLevelOrder = async (root, action) => {
	let h = getNodeHeight(root)
	for (let i = 1; i < h+1; i++) {
		await takeActionForCurrentLevel(root, i, action)
	}
}

const takeActionForCurrentLevelOrderReverse = async (root, action) => {
	let h = getNodeHeight(root)
	for (let i = h; i > 0; i--) {
		await takeActionForCurrentLevel(root, i, action)
	}
}

const takeActionForCurrentLevel = async (root, level, action) => {
	if (!root) {
		return
	}
	if (level == 1) {
		await action(root)
	}
	else if (level > 1) {
		await takeActionForCurrentLevel(root.left , level-1, action)
		await takeActionForCurrentLevel(root.right , level-1, action)
	}
}

const getNodeHeight = (node) => {
	if (!node) {
		return 0
	}
	else {
		let lheight = getNodeHeight(node.left)
		let rheight = getNodeHeight(node.right)

		if (lheight > rheight) return lheight+1
		else return rheight+1
	}
}

module.exports = { insertLevelOrder, getNodeHeight, takeActionForCurrentLevelOrder, takeActionForCurrentLevelOrderReverse }

