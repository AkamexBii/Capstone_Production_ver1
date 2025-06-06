import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Modal,
} from "react-bootstrap";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Header from "../../../components/Header";
import SideMenu from "../../../components/SideMenu";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./SearchingToy.scss";

const apiUrl = import.meta.env.VITE_API_URL || "https://localhost:7128";

// Hàm phân tích địa chỉ
const parseAddress = (address) => {
  if (!address || typeof address !== "string") {
    return { ward: "", district: "", city: "" };
  }
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part);
  let ward = "";
  let district = "";
  let city = "";
  if (parts.length >= 3) {
    ward = parts[parts.length - 3];
    district = parts[parts.length - 2];
    city = parts[parts.length - 1];
  } else if (parts.length === 2) {
    district = parts[0];
    city = parts[1];
  } else if (parts.length === 1) {
    city = parts[0];
  }
  return { ward, district, city };
};

// FilterPanel (giữ nguyên)
const FilterPanel = ({ showFilter, onToggle, filterValues, onChange, categories }) => {
  return (
    <div className={`filter-panel ${showFilter ? "show" : ""}`}>
      <Button variant="outline-primary" onClick={onToggle} className="action-btn">
        {showFilter ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
      </Button>
      {showFilter && (
        <Form className="filter-form mt-3">
          <Form.Group controlId="filterName" className="mb-3">
            <Form.Label>Tên đồ chơi</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={filterValues.name}
              onChange={onChange}
              placeholder="Nhập tên đồ chơi"
            />
          </Form.Group>
          <Form.Group controlId="filterCondition" className="mb-3">
            <Form.Label>Tình trạng</Form.Label>
            <Form.Control
              as="select"
              name="condition"
              value={filterValues.condition}
              onChange={onChange}
            >
              <option value="">Tất cả</option>
              <option value="Mới">Mới</option>
              <option value="Cũ">Cũ</option>
            </Form.Control>
          </Form.Group>
          <Form.Group controlId="filterCategory" className="mb-3">
            <Form.Label>Danh mục</Form.Label>
            <Form.Control
              as="select"
              name="category"
              value={filterValues.category}
              onChange={onChange}
            >
              <option value="">Tất cả</option>
              {categories.map((cat, index) => (
                <option key={index} value={cat}>
                  {cat}
                </option>
              ))}
            </Form.Control>
          </Form.Group>
          <Form.Group controlId="filterAgeRange" className="mb-3">
            <Form.Label>Độ tuổi</Form.Label>
            <Form.Control
              as="select"
              name="ageRange"
              value={filterValues.ageRange}
              onChange={onChange}
            >
              <option value="">Tất cả</option>
              <option value="0-3">0-3 tuổi</option>
              <option value="4-7">4-7 tuổi</option>
              <option value="8-12">8-12 tuổi</option>
              <option value="12+">12+ tuổi</option>
            </Form.Control>
          </Form.Group>
          <Form.Group controlId="filterPriceSort" className="mb-3">
            <Form.Label>Sắp xếp theo phí cho mượn</Form.Label>
            <Form.Control
              as="select"
              name="priceSort"
              value={filterValues.priceSort}
              onChange={onChange}
            >
              <option value="">Mặc định</option>
              <option value="asc">Từ thấp đến cao</option>
              <option value="desc">Từ cao đến thấp</option>
            </Form.Control>
          </Form.Group>
        </Form>
      )}
    </div>
  );
};

const SearchingToy = () => {
  const navigate = useNavigate();
  const [activeLink, setActiveLink] = useState("searching-toy");
  const [toys, setToys] = useState([]);
  const [mainUserId, setMainUserId] = useState(null);
  const [userRequests, setUserRequests] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedToy, setSelectedToy] = useState(null);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [borrowStart, setBorrowStart] = useState(null);
  const [borrowEnd, setBorrowEnd] = useState(null);
  const [note, setNote] = useState("");
  const [selectedToyId, setSelectedToyId] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [userAddress, setUserAddress] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [filterValues, setFilterValues] = useState({
    name: "",
    condition: "",
    category: "",
    ageRange: "",
    priceSort: "",
  });
  const [categories, setCategories] = useState([]);
  const [showUpdateLocationModal, setShowUpdateLocationModal] = useState(false);
  const [locationForm, setLocationForm] = useState({
    ward: "",
    district: "",
    city: "",
  });
  const [visibleItems, setVisibleItems] = useState(4);

  const sideMenuItems = [
    { id: 1, label: "Tìm kiếm đồ chơi", link: "/searchtoy" },
    { id: 2, label: "Danh sách mượn", link: "/sendingrequest" },
    { id: 3, label: "Lịch sử trao đổi", link: "/borrowhistory" },
  ];

  const getAuthToken = () => {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
  };

  useEffect(() => {
    const token = getAuthToken();
    setIsLoggedIn(!!token);
    const getMainUserId = () => {
      let userId = sessionStorage.getItem("userId");
      if (!userId) userId = localStorage.getItem("userId");
      if (userId) {
        setMainUserId(parseInt(userId));
      } else {
        navigate("/login");
      }
    };
    getMainUserId();
    if (token) fetchUserLocation();
  }, [navigate]);

  useEffect(() => {
    if (userAddress) {
      const parsed = parseAddress(userAddress);
      setLocationForm({
        ward: parsed.ward,
        district: parsed.district,
        city: parsed.city,
      });
    }
  }, [userAddress]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;
        const response = await axios.get(`${apiUrl}/api/Products/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCategories(response.data);
      } catch (error) {
        console.error("Lỗi khi lấy danh sách danh mục:", error);
        toast.error("Không thể tải danh sách danh mục!");
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

  const fetchUserLocation = async () => {
    const token = getAuthToken();
    if (!token) {
      setUserLocation(null);
      setUserAddress(null);
      return;
    }
    try {
      const response = await axios.get(`${apiUrl}/api/User/current/location`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { address, latitude, longitude } = response.data;
      if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
        setUserLocation({ latitude, longitude });
        setUserAddress(address || "Địa chỉ không được cung cấp");
      } else {
        setUserLocation(null);
        setUserAddress(address || null);
        toast.warn("Bạn cần cập nhật địa chỉ của mình để biết khoảng cách.");
      }
    } catch (error) {
      console.error("Lỗi khi lấy vị trí từ database:", error);
      setUserLocation(null);
      setUserAddress(null);
      toast.warn("Vui lòng cung cấp vị trí để tính khoảng cách.");
    }
  };

  const handleGetCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt của bạn không hỗ trợ định vị!");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let address = "";
        try {
          const response = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&addressdetails=1`,
            { headers: { "User-Agent": "ToySharingApp" } }
          );
          if (response.data && response.data.display_name) {
            address = response.data.display_name;
          }
        } catch (error) {
          console.error("Lỗi khi lấy địa chỉ từ Nominatim:", error);
          toast.error("Không thể lấy địa chỉ từ tọa độ!");
          return;
        }

        try {
          const token = getAuthToken();
          if (!token) {
            toast.error("Vui lòng đăng nhập để cập nhật vị trí!");
            return;
          }
          await axios.put(
            `${apiUrl}/api/User/${mainUserId}/location`,
            { address },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
          setUserLocation({ latitude, longitude });
          setUserAddress(address);
          toast.success("Lấy vị trí hiện tại thành công!");
          fetchUserLocation();
        } catch (error) {
          console.error("Lỗi khi cập nhật vị trí:", error);
          toast.error(error.response?.data.message || "Không thể cập nhật vị trí!");
        }
      },
      (error) => {
        console.error("Lỗi khi lấy vị trí hiện tại:", error);
        toast.error("Không thể lấy vị trí hiện tại. Vui lòng thử lại!");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleUpdateLocation = () => {
    setShowUpdateLocationModal(true);
  };

  const handleLocationFormChange = (e) => {
    const { name, value } = e.target;
    setLocationForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitLocation = async () => {
    const { ward, district, city } = locationForm;
    if (!ward || !district || !city) {
      toast.error("Vui lòng nhập đầy đủ Phường, Quận và Thành phố!");
      return;
    }
    const fullAddress = `${ward}, ${district}, ${city}`;
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Vui lòng đăng nhập để cập nhật vị trí!");
        setShowUpdateLocationModal(false);
        return;
      }
      await axios.put(
        `${apiUrl}/api/User/${mainUserId}/location`,
        { address: fullAddress },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      toast.success("Cập nhật vị trí thành công!");
      setUserAddress(fullAddress);
      setUserLocation(null);
      setShowUpdateLocationModal(false);
      setLocationForm({ ward: "", district: "", city: "" });
      fetchUserLocation();
    } catch (error) {
      console.error("Lỗi khi cập nhật vị trí:", error);
      toast.error(error.response?.data.message || "Không thể cập nhật vị trí!");
    }
  };

  useEffect(() => {
    const fetchToys = async () => {
      try {
        const token = getAuthToken();
        if (!token || !mainUserId) return;
        const response = await axios.get(`${apiUrl}/api/Products/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!Array.isArray(response.data)) {
          console.error("Dữ liệu API không phải mảng:", response.data);
          setToys([]);
          return;
        }
        const formattedToys = await Promise.all(
          response.data.map(async (toy) => {
            let distance = isLoggedIn ? null : "Vui lòng đăng nhập để biết khoảng cách";
            if (isLoggedIn) {
              let ownerLatitude, ownerLongitude;
              try {
                const ownerLocationResponse = await axios.get(
                  `${apiUrl}/api/User/${toy.userId}/location`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                ownerLatitude = ownerLocationResponse.data.latitude;
                ownerLongitude = ownerLocationResponse.data.longitude;
              } catch (error) {
                distance = "Chưa xác định vị trí của người sở hữu đồ chơi";
                return { ...toy, distance };
              }
              if (!ownerLatitude || !ownerLongitude) {
                distance = "Chưa xác định vị trí của người sở hữu đồ chơi";
                return { ...toy, distance };
              }
              if (userLocation && userLocation.latitude && userLocation.longitude) {
                try {
                  const distResponse = await axios.get(
                    `${apiUrl}/api/User/distance-to-product/${toy.productId}?myLatitude=${userLocation.latitude}&myLongitude=${userLocation.longitude}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                  );
                  distance = distResponse.data.distanceKilometers ?? "Không thể tính khoảng cách";
                } catch (error) {
                  distance = "Không thể tính khoảng cách";
                }
              } else {
                distance = "Chưa xác định vị trí của bạn";
              }
            }
            return {
              productId: toy.productId,
              userId: toy.userId,
              image:
                toy.imagePaths && toy.imagePaths.length > 0
                  ? toy.imagePaths[0]
                  : "https://via.placeholder.com/300x200?text=No+Image",
              name: toy.name || "Không có tên",
              ownerAvatar: toy.ownerAvatar || "https://via.placeholder.com/50?text=Avatar",
              createdAt: toy.createdAt
                ? new Date(toy.createdAt).toISOString().split("T")[0]
                : "Không có ngày",
              categoryName: toy.categoryName || "Không có danh mục",
              productStatus:
                toy.productStatus === 0
                  ? "Mới"
                  : toy.productStatus === 1
                    ? "Cũ"
                    : "Không xác định",
              suitableAge: toy.suitableAge || "Không xác định",
              price: parseFloat(toy.price) || 0,
              description: toy.description || "Không có mô tả",
              available: toy.available || 0,
              ownerName: toy.ownerName || "Người cho mượn",
              ownerId: toy.userId,
              distance,
            };
          })
        );
        const sortedToys = formattedToys.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        setToys(sortedToys);
      } catch (error) {
        console.error("Lỗi khi lấy danh sách đồ chơi:", error);
        toast.error("Không thể tải danh sách đồ chơi!");
        setToys([]);
      }
    };
    if (mainUserId) fetchToys();
  }, [mainUserId, userLocation, userAddress, isLoggedIn]);

  useEffect(() => {
    const fetchUserRequests = async () => {
      try {
        const token = getAuthToken();
        if (!token || !mainUserId) return;
        const response = await axios.get(`${apiUrl}/api/Requests/my-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserRequests(response.data);
      } catch (error) {
        console.error("Lỗi khi lấy danh sách yêu cầu mượn:", error);
        setUserRequests([]);
      }
    };
    if (mainUserId) fetchUserRequests();
  }, [mainUserId]);

  const handleOpenBorrowModal = (toyId) => {
    if (!isLoggedIn) {
      toast.error("Vui lòng đăng nhập để mượn đồ chơi!");
      navigate("/login");
      return;
    }
    setSelectedToyId(toyId);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const nextday = new Date();
    nextday.setDate(today.getDate() + 1);
    setBorrowStart(today);
    setBorrowEnd(nextday);
    setNote("");
    setShowBorrowModal(true);
  };

  const handleCloseBorrowModal = () => {
    setShowBorrowModal(false);
    setBorrowStart(null);
    setBorrowEnd(null);
    setNote("");
    setSelectedToyId(null);
  };

  const handleBorrowStartChange = (date) => {
    setBorrowStart(date);
    if (date) {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      if (!borrowEnd || borrowEnd <= date) {
        setBorrowEnd(nextDay);
      }
    } else {
      setBorrowEnd(null);
    }
  };

  const handleSendRequest = async () => {
    if (isSending) return;
    if (!selectedToyId || !borrowStart || !borrowEnd) {
      toast.error("Vui lòng điền đầy đủ thông tin mượn.");
      return;
    }

    const startDate = new Date(borrowStart);
    startDate.setHours(12, 0, 0, 0);
    const endDate = new Date(borrowEnd);
    endDate.setHours(12, 0, 0, 0);
    const minEndDate = new Date(startDate);
    minEndDate.setDate(startDate.getDate() + 1);

    if (endDate < minEndDate) {
      toast.error("Ngày trả phải sau ngày mượn ít nhất 1 ngày!");
      return;
    }

    setIsSending(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Vui lòng đăng nhập để gửi yêu cầu!");
        navigate("/login");
        return;
      }

      // Kiểm tra trạng thái đồ chơi
      const productResponse = await axios.get(`${apiUrl}/api/Products/${selectedToyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (productResponse.data.available !== 0) {
        toast.error("Đồ chơi không sẵn sàng để mượn!");
        handleCloseBorrowModal();
        return;
      }

      const requestDate = new Date().toISOString();
      const rentDate = new Date(borrowStart);
      rentDate.setHours(12, 0, 0, 0);
      const returnDate = new Date(borrowEnd);
      returnDate.setHours(12, 0, 0, 0);

      const formData = new FormData();
      formData.append("ProductId", selectedToyId);
      formData.append("RequestDate", requestDate);
      formData.append("RentDate", rentDate.toISOString());
      formData.append("ReturnDate", returnDate.toISOString());
      formData.append("Message", note || "");

      const response = await axios.post(`${apiUrl}/api/Requests`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      // Cập nhật userRequests
      const newRequest = {
        ...response.data,
        productId: selectedToyId,
        userId: mainUserId,
        status: 0,
      };
      setUserRequests((prev) => [...prev, newRequest]);

      toast.success("Gửi yêu cầu mượn thành công!");
      handleCloseBorrowModal();
    } catch (error) {
      console.error("Lỗi khi gửi yêu cầu mượn:", error);
      toast.error(error.response?.data?.message || "Lỗi khi gửi yêu cầu mượn!");
    } finally {
      setIsSending(false);
    }
  };

  const handleViewDetail = async (toyId) => {
    try {
      const token = getAuthToken();
      const response = await axios.get(`${apiUrl}/api/Products/${toyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSelectedToy({
        productId: response.data.productId,
        image:
          response.data.imagePaths && response.data.imagePaths.length > 0
            ? response.data.imagePaths[0]
            : "https://via.placeholder.com/300x200?text=No+Image",
        name: response.data.name || "Không có tên",
        categoryName: response.data.categoryName || "Không có danh mục",
        productStatus:
          response.data.productStatus === 0
            ? "Mới"
            : response.data.productStatus === 1
              ? "Cũ"
              : "Không xác định",
        suitableAge: response.data.suitableAge || "Không xác định",
        price: parseFloat(response.data.price) || 0,
        description: response.data.description || "Không có mô tả",
        available: response.data.available || 0,
        ownerId: response.data.userId,
      });
      setShowDetailModal(true);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết đồ chơi:", error);
      toast.error("Không thể tải chi tiết đồ chơi!");
    }
  };

  const handleViewProfile = async (ownerId) => {
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Vui lòng đăng nhập để xem thông tin người cho mượn!");
        navigate("/login");
        return;
      }
      const response = await axios.get(`${apiUrl}/api/User/profile/${ownerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userInfo = response.data.userInfo || response.data;
      setProfileData({ ...userInfo, userId: ownerId });
      setShowProfileModal(true);
    } catch (error) {
      console.error("Lỗi khi lấy thông tin người cho mượn:", error);
      toast.error("Không thể tải thông tin người cho mượn!");
    }
  };

  const handleMessage = async (ownerId) => {
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Vui lòng đăng nhập để nhắn tin!");
        navigate("/login");
        return;
      }
      if (!ownerId || isNaN(ownerId)) {
        toast.error("ID người dùng không hợp lệ!");
        return;
      }
      if (ownerId === mainUserId) {
        toast.error("Bạn không thể nhắn tin cho chính mình!");
        return;
      }
      const response = await axios.get(`${apiUrl}/api/Conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conversations = response.data;
      const existingConversation = conversations.find(
        (convo) =>
          (convo.user1Id === ownerId && convo.user2Id === mainUserId) ||
          (convo.user2Id === ownerId && convo.user1Id === mainUserId)
      );
      let conversationId;
      if (existingConversation) {
        conversationId = existingConversation.conversationId;
      } else {
        const createResponse = await axios.post(
          `${apiUrl}/api/Conversations`,
          { user2Id: ownerId },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        conversationId = createResponse.data.conversationId;
      }
      navigate("/message", { state: { activeConversationId: conversationId } });
    } catch (error) {
      console.error("Lỗi khi xử lý nhắn tin:", error);
      toast.error(error.response?.data?.message || "Không thể bắt đầu cuộc trò chuyện!");
    }
  };

  const handleLoadMore = () => {
    setVisibleItems((prev) => prev + 4);
  };

  const filteredToys = toys
    .filter((toy) => {
      const matchesName = filterValues.name
        ? toy.name.toLowerCase().includes(filterValues.name.toLowerCase())
        : true;
      const matchesCondition = filterValues.condition
        ? toy.productStatus === filterValues.condition
        : true;
      const matchesCategory = filterValues.category
        ? toy.categoryName === filterValues.category
        : true;
      const matchesAgeRange = filterValues.ageRange
        ? (() => {
          const age = parseInt(toy.suitableAge);
          switch (filterValues.ageRange) {
            case "0-3":
              return age >= 0 && age <= 3;
            case "4-7":
              return age >= 4 && age <= 7;
            case "8-12":
              return age >= 8 && age <= 12;
            case "12+":
              return age >= 12;
            default:
              return true;
          }
        })()
        : true;
      return matchesName && matchesCondition && matchesCategory && matchesAgeRange;
    })
    .sort((a, b) => {
      if (filterValues.priceSort === "asc") {
        return parseFloat(a.price) - parseFloat(b.price);
      } else if (filterValues.priceSort === "desc") {
        return parseFloat(b.price) - parseFloat(a.price);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const visibleToys = filteredToys.slice(0, visibleItems);

  if (!Array.isArray(toys)) {
    return (
      <div className="searching-toy-page home-page">
        <Header
          activeLink={activeLink}
          setActiveLink={setActiveLink}
          isLoggedIn={isLoggedIn}
          unreadMessages={3}
          notificationCount={2}
        />
        <Container fluid className="mt-4">
          <Row>
            <Col xs={12} md={2}>
              <SideMenu menuItems={sideMenuItems} activeItem={1} />
            </Col>
            <Col xs={12} md={10} className="main-content">
              <p>Đang tải dữ liệu...</p>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  return (
    <div className="searching-toy-page home-page">
      <Header
        activeLink={activeLink}
        setActiveLink={setActiveLink}
        isLoggedIn={isLoggedIn}
        unreadMessages={3}
        notificationCount={2}
      />
      <Container fluid className="mt-4">
        <Row>
          <Col xs={12} md={2}>
            <SideMenu menuItems={sideMenuItems} activeItem={1} />
          </Col>
          <Col xs={12} md={10} className="main-content">
            <div className="filter-and-actions d-flex align-items-center mb-3">
              <div className="filter-panel-wrapper">
                <FilterPanel
                  showFilter={showFilter}
                  onToggle={() => setShowFilter(!showFilter)}
                  filterValues={filterValues}
                  onChange={(e) =>
                    setFilterValues({ ...filterValues, [e.target.name]: e.target.value })
                  }
                  categories={categories}
                />
              </div>
              <div className="action-buttons d-flex align-items-center ms-3">
                <Button
                  variant="outline-primary"
                  className="action-btn me-2"
                  onClick={handleGetCurrentLocation}
                >
                  Lấy vị trí hiện tại
                </Button>
                <Button
                  variant="outline-primary"
                  className="action-btn"
                  onClick={handleUpdateLocation}
                >
                  Cập nhật vị trí
                </Button>
              </div>
            </div>
            <Row className="request-items-section">
              {visibleToys.length === 0 ? (
                <Col className="text-center">
                  <h5>Không có đồ chơi nào để hiển thị</h5>
                </Col>
              ) : (
                visibleToys.map((toy) => {
                  const hasSentRequest = userRequests.some(
                    (req) =>
                      req.productId === toy.productId &&
                      req.userId === mainUserId &&
                      req.status === 0
                  );
                  return (
                    <Col key={toy.productId} xs={12} md={6} className="mb-4">
                      <Card
                        className="request-card"
                        onClick={() => handleViewDetail(toy.productId)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="image-frame">
                          <Card.Img
                            variant="top"
                            src={toy.image}
                            className="toy-image"
                            onError={(e) =>
                              (e.target.src = "https://via.placeholder.com/300x200?text=No+Image")
                            }
                          />
                        </div>
                        <Card.Body>
                          <Card.Title className="toy-name">{toy.name}</Card.Title>
                          <Card.Text className="send-date">
                            <strong>Ngày đăng:</strong> {toy.createdAt}
                          </Card.Text>
                          <Card.Text className="price">
                            <strong>Phí cho mượn:</strong>{" "}
                            {toy.price.toLocaleString("vi-VN")} VND
                          </Card.Text>
                          <Card.Text className="status">
                            <strong>Trạng thái:</strong>{" "}
                            <span
                              className={toy.available === 0 ? "available" : "unavailable"}
                            >
                              {toy.available === 0 ? "Sẵn sàng cho mượn" : "Đã cho mượn"}
                            </span>
                          </Card.Text>
                          <Card.Text className="distance">
                            <strong>Khoảng cách:</strong>{" "}
                            {typeof toy.distance === "number"
                              ? `${toy.distance.toFixed(2)} km`
                              : toy.distance}
                          </Card.Text>
                          <div className="lender-info d-flex align-items-center mb-2">
                            <img
                              src={toy.ownerAvatar}
                              alt="Ảnh đại diện người cho mượn"
                              className="lender-avatar"
                              onError={(e) =>
                                (e.target.src = "https://via.placeholder.com/50?text=Avatar")
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewProfile(toy.ownerId);
                              }}
                              style={{ cursor: "pointer" }}
                            />
                            <Button
                              variant="link"
                              className="lender-link p-0 text-decoration-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewProfile(toy.ownerId);
                              }}
                            >
                              Thông tin người cho mượn
                            </Button>
                          </div>
                          <div className="request-actions text-center">
                            <Button
                              variant="primary"
                              className="action-btn borrow-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBorrowModal(toy.productId);
                              }}
                              disabled={
                                toy.available !== 0 ||
                                toy.ownerId === mainUserId ||
                                hasSentRequest
                              }
                            >
                              {hasSentRequest ? "Đã gửi yêu cầu" : "Mượn"}
                            </Button>
                            <Card.Text className="status-hint">
                              {hasSentRequest
                                ? "Yêu cầu mượn của bạn đang chờ xác nhận."
                                : toy.available !== 0
                                  ? "Đồ chơi hiện không sẵn sàng để mượn."
                                  : toy.ownerId === mainUserId
                                    ? "Bạn không thể mượn đồ chơi của chính mình."
                                    : "Nhấn 'Mượn' để gửi yêu cầu mượn."}
                            </Card.Text>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })
              )}
            </Row>
            {visibleToys.length < filteredToys.length && (
              <div className="text-center">
                <Button
                  variant="outline-primary"
                  className="view-more-btn action-btn"
                  onClick={handleLoadMore}
                >
                  Xem thêm
                </Button>
              </div>
            )}
          </Col>
        </Row>
      </Container>
      <Modal
        show={showDetailModal}
        onHide={() => setShowDetailModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết đồ chơi</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedToy && (
            <>
              <div className="image-frame">
                <img
                  src={selectedToy.image}
                  alt={selectedToy.name}
                  className="detail-image"
                  onError={(e) =>
                    (e.target.src = "https://via.placeholder.com/300x200?text=No+Image")
                  }
                />
              </div>
              <h5 className="mt-3">{selectedToy.name}</h5>
              <p>
                <strong>Danh mục:</strong> {selectedToy.categoryName || "Không có"}
              </p>
              <p>
                <strong>Tình trạng:</strong> {selectedToy.productStatus || "Không có"}
              </p>
              <p>
                <strong>Độ tuổi phù hợp:</strong>{" "}
                {selectedToy.suitableAge || "Không có"}
              </p>
              <p>
                <strong>Phí cho mượn:</strong>{" "}
                {selectedToy.price.toLocaleString("vi-VN")} VND
              </p>
              <p>
                <strong>Mô tả:</strong> {selectedToy.description || "Không có"}
              </p>
              <p>
                <strong>Trạng thái:</strong>{" "}
                {selectedToy.available === 0 ? "Sẵn sàng cho mượn" : "Đã cho mượn"}
              </p>
              {userRequests.some(
                (req) =>
                  req.productId === selectedToy.productId &&
                  req.userId === mainUserId &&
                  req.status === 0
              ) && (
                  <p className="text-success">
                    Bạn đã gửi yêu cầu mượn cho đồ chơi này.
                  </p>
                )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            className="action-btn"
            onClick={() => setShowDetailModal(false)}
          >
            Đóng
          </Button>
          {selectedToy && (
            <Button
              variant="primary"
              className="action-btn borrow-btn"
              onClick={() => {
                if (!isLoggedIn) {
                  toast.error("Vui lòng đăng nhập để mượn đồ chơi!");
                  navigate("/login");
                  return;
                }
                handleOpenBorrowModal(selectedToy.productId);
              }}
              disabled={
                selectedToy.available !== 0 ||
                selectedToy.ownerId === mainUserId ||
                userRequests.some(
                  (req) =>
                    req.productId === selectedToy.productId &&
                    req.userId === mainUserId &&
                    req.status === 0
                )
              }
            >
              {userRequests.some(
                (req) =>
                  req.productId === selectedToy.productId &&
                  req.userId === mainUserId &&
                  req.status === 0
              )
                ? "Đã gửi yêu cầu"
                : "Mượn"}
            </Button>
          )}
          <Button
            variant="secondary"
            className="action-btn"
            onClick={() => setShowDetailModal(false)}
          >
            Đóng
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showBorrowModal}
        onHide={handleCloseBorrowModal}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Nhập thông tin mượn</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="borrowStartDate" className="mb-3">
              <Form.Label>Ngày bắt đầu mượn</Form.Label>
              <DatePicker
                selected={borrowStart}
                onChange={handleBorrowStartChange}
                dateFormat="yyyy-MM-dd"
                className="form-control date-picker-input"
                placeholderText="Chọn ngày bắt đầu"
                minDate={new Date()}
              />
            </Form.Group>
            <Form.Group controlId="borrowEndDate" className="mb-3">
              <Form.Label>Ngày kết thúc mượn</Form.Label>
              <DatePicker
                selected={borrowEnd}
                onChange={(date) => setBorrowEnd(date)}
                dateFormat="yyyy-MM-dd"
                className="form-control date-picker-input"
                placeholderText="Chọn ngày kết thúc"
                minDate={
                  borrowStart
                    ? new Date(borrowStart).setDate(borrowStart.getDate() + 1)
                    : new Date(new Date().setDate(new Date().getDate() + 1))
                }
              />
            </Form.Group>
            <Form.Group controlId="borrowNote">
              <Form.Label>Ghi chú</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nhập ghi chú"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            className="action-btn"
            onClick={handleCloseBorrowModal}
          >
            Quay lại
          </Button>
          <Button
            variant="primary"
            className="action-btn"
            onClick={handleSendRequest}
            disabled={isSending}
          >
            {isSending ? "Đang gửi..." : "Gửi yêu cầu"}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showProfileModal}
        onHide={() => setShowProfileModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Thông tin người cho mượn</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {profileData ? (
            <div>
              <img
                src={
                  profileData.avatar ||
                  "https://via.placeholder.com/100?text=Avatar"
                }
                alt="Ảnh đại diện"
                className="rounded-circle mb-3"
                style={{ width: "100px", height: "100px", objectFit: "cover" }}
                onError={(e) =>
                  (e.target.src = "https://via.placeholder.com/100?text=Avatar")
                }
              />
              <p>
                <strong>Tên hiển thị:</strong>{" "}
                {profileData.displayName || "Không có"}
              </p>
              <p>
                <strong>Tuổi:</strong> {profileData.age || "Không có thông tin"}
              </p>
              <p>
                <strong>Địa chỉ:</strong>{" "}
                {profileData.address || "Không có thông tin"}
              </p>
              <p>
                <strong>Đánh giá:</strong>{" "}
                {profileData.rating
                  ? profileData.rating.toFixed(2)
                  : "Chưa có đánh giá"}
              </p>
            </div>
          ) : (
            <p>Đang tải thông tin...</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            className="action-btn"
            onClick={() => setShowProfileModal(false)}
          >
            Đóng
          </Button>
          <Button
            variant="primary"
            className="action-btn"
            onClick={() => handleMessage(profileData?.userId)}
            disabled={
              !profileData ||
              !isLoggedIn ||
              !profileData?.userId ||
              profileData?.userId === mainUserId
            }
          >
            Nhắn tin
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showUpdateLocationModal}
        onHide={() => setShowUpdateLocationModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Cập nhật vị trí</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="ward" className="mb-3">
              <Form.Label>
                Phường <span className="required-asterisk">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="ward"
                value={locationForm.ward}
                onChange={handleLocationFormChange}
                placeholder="Ví dụ: Văn Quán"
                required
              />
            </Form.Group>
            <Form.Group controlId="district" className="mb-3">
              <Form.Label>
                Quận <span className="required-asterisk">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="district"
                value={locationForm.district}
                onChange={handleLocationFormChange}
                placeholder="Ví dụ: Hà Đông"
                required
              />
            </Form.Group>
            <Form.Group controlId="city" className="mb-3">
              <Form.Label>
                Thành phố <span className="required-asterisk">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="city"
                value={locationForm.city}
                onChange={handleLocationFormChange}
                placeholder="Ví dụ: Hà Nội"
                required
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            className="action-btn"
            onClick={() => setShowUpdateLocationModal(false)}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            className="action-btn"
            onClick={handleSubmitLocation}
          >
            Cập nhật
          </Button>
        </Modal.Footer>
      </Modal>
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

export default SearchingToy;