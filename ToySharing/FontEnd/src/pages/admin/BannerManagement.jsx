import React, { useState, useEffect } from "react";
import { Container, Row, Col, Table, Button, Modal, Form, Pagination } from "react-bootstrap";
import axios from "axios";
import AdminSideMenu from "../../components/AdminSideMenu";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./BannerManagement.scss";

const apiUrl = import.meta.env.VITE_API_URL || "https://localhost:7128";

const BannerManagement = () => {
    const [banners, setBanners] = useState([]);
    const [filteredBanners, setFilteredBanners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentBanner, setCurrentBanner] = useState(null);
    const [formData, setFormData] = useState({
        title: "",
        linkUrl: "",
        status: "",
        priority: "",
        image: null,
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(5); // Số banner mỗi trang

    const menuItems = [
        { id: 1, label: "Trang chủ", link: "/adminpage" },
        { id: 2, label: "Quản lý người dùng", link: "/manageuser" },
        { id: 3, label: "Quản lý banner", link: "/banner-management" },
        { id: 4, label: "Quản lý danh mục", link: "/category-management" },
        { id: 5, label: "Quản lý bài đăng", link: "/managepost" },
        { id: 6, label: "Thống kê", link: "/statistic" },
    ];

    const statusOptions = [
        { value: "0", label: "Hiện" },
        { value: "1", label: "Ẩn" },
    ];

    useEffect(() => {
        fetchBanners();
    }, []);

    const fetchBanners = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${apiUrl}/api/admin/banners`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token") || sessionStorage.getItem("token")}` },
            });
            if (Array.isArray(response.data)) {
                // Sắp xếp banner theo thời gian tạo (mới nhất lên đầu)
                const sortedBanners = response.data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setBanners(sortedBanners);
                setFilteredBanners(sortedBanners);
            } else {
                console.error("Expected an array from API but got:", response.data);
                setBanners([]);
                setFilteredBanners([]);
                toast.error("Dữ liệu nhận được không đúng định dạng.");
            }
        } catch (error) {
            console.error("Error fetching banners:", error);
            setBanners([]);
            setFilteredBanners([]);
            if (error.response?.status === 401) {
                toast.error("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
            } else {
                toast.error("Lỗi khi tải danh sách banner. Vui lòng thử lại.");
            }
        } finally {
            setLoading(false);
        }
    };

    // Xử lý tìm kiếm
    useEffect(() => {
        const filtered = banners.filter((banner) =>
            banner.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredBanners(filtered);
        setCurrentPage(1); // Reset về trang đầu khi tìm kiếm
    }, [searchTerm, banners]);

    // Phân trang
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredBanners.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredBanners.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const handleAddBanner = () => {
        setIsEditing(false);
        setFormData({
            title: "",
            linkUrl: "",
            status: "0", // Mặc định là "Hiện"
            priority: "",
            image: null,
        });
        setShowModal(true);
    };

    const handleEditBanner = (banner) => {
        setIsEditing(true);
        setCurrentBanner(banner);
        setFormData({
            title: banner.title,
            linkUrl: banner.linkUrl || "",
            status: banner.status.toString(),
            priority: banner.priority || "",
            image: null,
        });
        setShowModal(true);
    };

    const handleDeleteBanner = async (id) => {
        try {
            await axios.delete(`${apiUrl}/api/admin/banners/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token") || sessionStorage.getItem("token")}` },
            });
            toast.success("Xóa banner thành công!");
            fetchBanners();
        } catch (error) {
            console.error("Error deleting banner:", error);
            if (error.response?.status === 401) {
                toast.error("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
            } else {
                toast.error("Lỗi khi xóa banner. Vui lòng thử lại.");
            }
        }
    };

    const handleSubmit = async () => {
        // Validation for required fields
        if (!formData.title.trim()) {
            toast.error("Tiêu đề là bắt buộc.");
            return;
        }
        if (formData.status === "") {
            toast.error("Trạng thái là bắt buộc.");
            return;
        }
        if (!isEditing && !formData.image) {
            toast.error("Ảnh là bắt buộc khi thêm banner mới.");
            return;
        }

        const data = new FormData();
        data.append("title", formData.title);
        data.append("linkUrl", formData.linkUrl);
        data.append("status", formData.status);
        data.append("priority", formData.priority);
        if (formData.image) {
            data.append("image", formData.image);
        }

        try {
            if (isEditing) {
                await axios.put(`${apiUrl}/api/admin/banners/${currentBanner.bannerId}`, data, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token") || sessionStorage.getItem("token")}`,
                        "Content-Type": "multipart/form-data",
                    },
                });
                toast.success("Cập nhật banner thành công!");
            } else {
                await axios.post(`${apiUrl}/api/admin/banners`, data, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token") || sessionStorage.getItem("token")}`,
                        "Content-Type": "multipart/form-data",
                    },
                });
                toast.success("Thêm banner thành công!");
            }
            setShowModal(false);
            fetchBanners();
        } catch (error) {
            console.error("Error saving banner:", error);
            if (error.response?.status === 401) {
                toast.error("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
            } else {
                toast.error("Lỗi khi lưu banner. Vui lòng thử lại.");
            }
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleFileChange = (e) => {
        setFormData({ ...formData, image: e.target.files[0] });
    };

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };

    return (
        <div className="banner-page banner-management">
            <Container fluid className="mt-4">
                <Row>
                    <Col xs={12} md={2}>
                        <AdminSideMenu menuItems={menuItems} />
                    </Col>
                    <Col xs={12} md={10} className="main-content">
                        <h1>Quản lý Banner</h1>
                        <div className="d-flex justify-content-between mb-3">
                            <Button variant="primary" onClick={handleAddBanner}>
                                Thêm Banner
                            </Button>
                            <Form className="d-flex" style={{ maxWidth: "300px" }}>
                                <Form.Control
                                    type="text"
                                    placeholder="Tìm kiếm tiêu đề..."
                                    value={searchTerm}
                                    onChange={handleSearchChange}
                                />
                            </Form>
                        </div>
                        <Table striped bordered hover className="mt-3">
                            <thead>
                                <tr>
                                    <th>Số thứ tự</th>
                                    <th>Tiêu đề</th>
                                    <th>Ảnh banner</th>
                                    <th>Liên kết tới</th>
                                    <th>Trạng thái</th>
                                    <th>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6">Đang tải...</td>
                                    </tr>
                                ) : Array.isArray(currentItems) ? (
                                    currentItems.length > 0 ? (
                                        currentItems.map((banner, index) => (
                                            <tr key={banner.bannerId}>
                                                <td>{indexOfFirstItem + index + 1}</td>
                                                <td>{banner.title}</td>
                                                <td>
                                                    <img src={banner.imageUrl} alt={banner.title} width="100" className="banner-image" />
                                                </td>
                                                <td className="text-wrap">{banner.linkUrl || "Không có"}</td>
                                                <td>{statusOptions.find(opt => opt.value === banner.status.toString())?.label || "Không xác định"}</td>
                                                <td>
                                                    <Button
                                                        variant="warning"
                                                        onClick={() => handleEditBanner(banner)}
                                                    >
                                                        Sửa
                                                    </Button>{" "}
                                                    <Button
                                                        variant="danger"
                                                        onClick={() => handleDeleteBanner(banner.bannerId)}
                                                    >
                                                        Xóa
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6">Không tìm thấy banner nào.</td>
                                        </tr>
                                    )
                                ) : (
                                    <tr>
                                        <td colSpan="6">Lỗi khi tải dữ liệu banner.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>

                        {/* Phân trang */}
                        {totalPages > 1 && (
                            <Pagination className="justify-content-center">
                                <Pagination.Prev
                                    onClick={() => paginate(currentPage - 1)}
                                    disabled={currentPage === 1}
                                />
                                {Array.from({ length: totalPages }, (_, index) => (
                                    <Pagination.Item
                                        key={index + 1}
                                        active={index + 1 === currentPage}
                                        onClick={() => paginate(index + 1)}
                                    >
                                        {index + 1}
                                    </Pagination.Item>
                                ))}
                                <Pagination.Next
                                    onClick={() => paginate(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                />
                            </Pagination>
                        )}
                    </Col>
                </Row>
            </Container>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{isEditing ? "Sửa Banner" : "Thêm Banner"}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div>
                        <div className="mb-3">
                            <label>Tiêu đề <span style={{ color: "red" }}>*</span></label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                className="form-control"
                                required
                            />
                        </div>
                        <div className="mb-3">
                            <label>Liên kết</label>
                            <textarea
                                name="linkUrl"
                                value={formData.linkUrl}
                                onChange={handleChange}
                                className="form-control"
                                rows="3"
                                placeholder="Nhập liên kết..."
                            />
                        </div>
                        <div className="mb-3">
                            <label>Trạng thái <span style={{ color: "red" }}>*</span></label>
                            <Form.Select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                required
                            >
                                <option value="">Chọn trạng thái</option>
                                {statusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Form.Select>
                        </div>
                        <div className="mb-3">
                            <label>Ảnh {isEditing ? "" : <span style={{ color: "red" }}>*</span>}</label>
                            <input
                                type="file"
                                onChange={handleFileChange}
                                className="form-control"
                                accept="image/*"
                                required={!isEditing}
                            />
                        </div>
                        <Button variant="primary" onClick={handleSubmit}>
                            {isEditing ? "Cập nhật" : "Thêm"}
                        </Button>
                    </div>
                </Modal.Body>
            </Modal>
            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
            />
        </div>
    );
};

export default BannerManagement;