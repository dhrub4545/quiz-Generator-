import { useState, useEffect } from 'react';
import { 
  Button, 
  Box, 
  Typography, 
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Radio,
  RadioGroup,
  FormControlLabel,
  LinearProgress,
  Chip,
  Paper,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Timer as TimerIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import localforage from 'localforage';

const MockQuiz = () => {
  const [quizConfig, setQuizConfig] = useState({
    topic: '',
    difficulty: 'medium',
    questionCount: 5
  });
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quizStarted, setQuizStarted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!quizStarted || !timeLeft) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [quizStarted, timeLeft]);

  const fetchWikipedia = async (topic) => {
    const endpoint = "https://en.wikipedia.org/w/api.php";
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "extracts",
      exintro: true,
      explaintext: true,
      titles: topic,
      origin: "*"
    });

    try {
      const response = await fetch(`${endpoint}?${params}`);
      if (!response.ok) throw new Error(`Wikipedia API returned ${response.status}`);
      
      const data = await response.json();
      const pages = data.query.pages;
      
      for (const pageId in pages) {
        if (pages[pageId].extract) {
          return pages[pageId].extract;
        }
      }
      return "No extract found for this topic.";
    } catch (error) {
      console.error("Wikipedia fetch error:", error);
      return `Error fetching data: ${error.message}`;
    }
  };

  const buildPrompt = (topic, difficulty, count, context = null) => {
    return `Generate exactly ${count} multiple-choice questions based on:
${context ? `Context:\n${context.substring(0, 2000)}\n\n` : ''}
Topic: ${topic}
Difficulty: ${difficulty}

Format each as: ["question", ["option1", "option2", "option3", "option4"], correctIndex]
Only return a valid JSON array, no other text or markdown.`;
  };

  const handleStartQuiz = async () => {
    if (!quizConfig.topic.trim()) {
      setError('Please enter a topic for the mock quiz');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Fetch Wikipedia context
      let wikiContext = '';
      try {
        wikiContext = await fetchWikipedia(quizConfig.topic);
      } catch (wikiError) {
        console.log("Proceeding without Wikipedia context", wikiError);
      }

      // Build prompt for AI
      const prompt = buildPrompt(
        quizConfig.topic,
        quizConfig.difficulty,
        quizConfig.questionCount,
        wikiContext.startsWith('Error') ? null : wikiContext
      );

      // Generate questions using the same API as CreateQuiz
      const response = await fetch('http://localhost:5000/api/generate-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, count: quizConfig.questionCount })
      });

      if (!response.ok) throw new Error(await response.text());
      
      const result = await response.json();
      const generatedQuestions = Array.isArray(result) ? result : 
                       Array.isArray(result?.mcqs) ? result.mcqs : 
                       [];

      // Format questions for the quiz
      const formattedQuestions = generatedQuestions.map(q => ({
        question: q[0] || 'No question text',
        options: Array.isArray(q[1]) ? q[1] : ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correctAnswer: q[1]?.[q[2]] || q[1]?.[0] || 'Option 1'
      }));

      setQuestions(formattedQuestions);
      
      // Initialize selected options
      setSelectedOptions(new Array(formattedQuestions.length).fill(null));
      
      // Set timer (1 minute per question)
      setTimeLeft(formattedQuestions.length * 60);
      
      // Start the quiz
      setQuizStarted(true);
    } catch (err) {
      setError('Failed to generate questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionIndex, optionIndex) => {
    const newSelectedOptions = [...selectedOptions];
    newSelectedOptions[questionIndex] = optionIndex;
    setSelectedOptions(newSelectedOptions);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (selectedOptions.includes(null)) {
      setError('Please answer all questions');
      return;
    }

    const score = questions.reduce((acc, question, index) => {
      const isCorrect = selectedOptions[index] === question.options.indexOf(question.correctAnswer);
      return acc + (isCorrect ? 1 : 0);
    }, 0);

    const result = {
      quizId: 'mock-' + Date.now(),
      quizName: `Mock Quiz: ${quizConfig.topic}`,
      date: new Date().toISOString(),
      score,
      total: questions.length,
      topic: quizConfig.topic,
      difficulty: quizConfig.difficulty,
      answers: questions.map((q, i) => ({
        question: q.question,
        selected: q.options[selectedOptions[i]],
        correct: q.correctAnswer,
        isCorrect: selectedOptions[i] === q.options.indexOf(q.correctAnswer)
      }))
    };

    // Save result to history
    const existingResults = await localforage.getItem('testResults') || [];
    await localforage.setItem('testResults', [...existingResults, result]);
    
    // Navigate to results page
    navigate('/user/view-result', { state: { result } });
  };

  if (!quizStarted) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Create Mock Quiz
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" sx={{ mb: 4 }}>
          <TextField
            fullWidth
            label="Topic"
            value={quizConfig.topic}
            onChange={(e) => setQuizConfig({...quizConfig, topic: e.target.value})}
            sx={{ mb: 2 }}
            required
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Difficulty</InputLabel>
            <Select
              value={quizConfig.difficulty}
              onChange={(e) => setQuizConfig({...quizConfig, difficulty: e.target.value})}
              label="Difficulty"
            >
              <MenuItem value="easy">Easy</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="hard">Hard</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Number of Questions"
            type="number"
            inputProps={{ min: 1, max: 20 }}
            value={quizConfig.questionCount}
            onChange={(e) => setQuizConfig({
              ...quizConfig,
              questionCount: Math.min(20, Math.max(1, parseInt(e.target.value) || 5))
            })}
            sx={{ mb: 2 }}
          />

          <Button
            variant="contained"
            onClick={handleStartQuiz}
            disabled={loading || !quizConfig.topic.trim()}
            size="large"
            fullWidth
          >
            {loading ? <CircularProgress size={24} /> : 'Start Mock Quiz'}
          </Button>
        </Box>
      </Box>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  
  return (
    <Paper elevation={3} sx={{ 
      maxWidth: 800, 
      mx: 'auto', 
      p: 4,
      borderRadius: 3
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 3
      }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Mock Quiz: {quizConfig.topic}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Chip label={quizConfig.topic} size="small" />
            <Chip label={quizConfig.difficulty} size="small" color="secondary" />
          </Box>
        </Box>
        
        <Chip
          icon={<TimerIcon />}
          label={`Time: ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
          color={timeLeft < 60 ? 'error' : 'primary'}
          sx={{ fontWeight: 'bold' }}
        />
      </Box>

      <LinearProgress 
        variant="determinate" 
        value={progress} 
        sx={{ height: 8, borderRadius: 4, mb: 3 }}
      />

      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Question {currentQuestionIndex + 1} of {questions.length}
      </Typography>
      
      <Card variant="outlined" sx={{ mb: 3, p: 2, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="medium">
            {currentQuestion.question}
          </Typography>
        </CardContent>
      </Card>

      <FormControl component="fieldset" fullWidth>
        <RadioGroup
          value={selectedOptions[currentQuestionIndex] ?? ''}
          onChange={(e) => handleOptionSelect(currentQuestionIndex, parseInt(e.target.value))}
        >
          {currentQuestion.options.map((option, index) => (
            <Card 
              key={index}
              variant="outlined"
              sx={{ 
                mb: 1,
                borderRadius: 2,
                borderColor: selectedOptions[currentQuestionIndex] === index ? 'primary.main' : 'divider',
                bgcolor: selectedOptions[currentQuestionIndex] === index ? 'primary.light' : 'background.paper'
              }}
            >
              <FormControlLabel
                value={index}
                control={<Radio color="primary" />}
                label={
                  <Typography variant="body1">
                    {option}
                  </Typography>
                }
                sx={{ 
                  width: '100%',
                  m: 0,
                  p: 1.5,
                  '&:hover': {
                    bgcolor: 'action.hover'
                  }
                }}
              />
            </Card>
          ))}
        </RadioGroup>
      </FormControl>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        mt: 4,
        gap: 2
      }}>
        <Button
          variant="outlined"
          onClick={() => setQuizStarted(false)}
          startIcon={<ArrowBackIcon />}
          sx={{ borderRadius: 2 }}
        >
          Back to Setup
        </Button>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            startIcon={<ArrowBackIcon />}
            sx={{ borderRadius: 2 }}
          >
            Previous
          </Button>
          
          {currentQuestionIndex < questions.length - 1 ? (
            <Button 
              variant="contained" 
              onClick={handleNext}
              endIcon={<ArrowForwardIcon />}
              sx={{ borderRadius: 2 }}
            >
              Next
            </Button>
          ) : (
            <Button 
              variant="contained" 
              color="success" 
              onClick={handleSubmit}
              endIcon={<SendIcon />}
              sx={{ borderRadius: 2 }}
            >
              Submit Quiz
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

export default MockQuiz;